package ninja.sketchmate.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.Person
import androidx.core.content.FileProvider
import androidx.core.content.LocusIdCompat
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import java.io.File
import java.io.FileOutputStream
import java.net.URL
import kotlin.collections.iterator

class CustomMessagingService : FirebaseMessagingService() {

    companion object {
        private const val CHAT_CHANNEL_ID = "chat_messages"
        private const val SYSTEM_CHANNEL_ID = "system_alerts"
        private const val LOBBY_CHANNEL_ID = "lobby_invites"

        private const val GROUP_KEY_CHATS = "ninja.sketchmate.CHATS"
        private const val GROUP_KEY_ALERTS = "ninja.sketchmate.ALERTS"

        // Stable summary IDs so we always update — not stack — the summary card
        private const val CHAT_SUMMARY_ID = 1_000_001
        private const val ALERT_SUMMARY_ID = 1_000_002
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        if (isAppInForeground()) {
            return
        }

        val data = remoteMessage.data
        val type = data["type"] ?: return

        setupChannels()

        when (type) {
            "dm_message" -> showChatNotification(data, isDrawing = false)
            "drawing_received" -> showChatNotification(data, isDrawing = true)
            "mate_request", "request_accepted" -> showSystemNotification(data)
            "lobby_invitation" -> showLobbyNotification(data)
            else -> showDefaultNotification(remoteMessage, data)
        }
    }

    /**
     * Fallback for notification types without custom UI
     * (moderation_strike, moderation_lifted, balloon_match, etc).
     * Uses the FCM `notification` block for title/body.
     */
    private fun showDefaultNotification(
        remoteMessage: RemoteMessage,
        data: Map<String, String>
    ) {
        val notif = remoteMessage.notification
        val title = notif?.title ?: data["title"] ?: "Sketchmate"
        val body = notif?.body ?: data["body"] ?: ""
        val type = data["type"] ?: "default"

        val notificationId = (type + title + body).hashCode()
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        val builder = NotificationCompat.Builder(this, SYSTEM_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_name)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(buildTapIntent(data, notificationId))

        nm.notify(notificationId, builder.build())
    }

    private fun setupChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        nm.createNotificationChannel(
            NotificationChannel(
                CHAT_CHANNEL_ID,
                "Direct Messages",
                NotificationManager.IMPORTANCE_HIGH
            )
        )
        nm.createNotificationChannel(
            NotificationChannel(
                SYSTEM_CHANNEL_ID,
                "System Alerts",
                NotificationManager.IMPORTANCE_DEFAULT
            )
        )
        nm.createNotificationChannel(
            NotificationChannel(
                LOBBY_CHANNEL_ID,
                "Lobby Invitations",
                NotificationManager.IMPORTANCE_HIGH
            )
        )
    }

    // ============================================================
    // CHAT NOTIFICATIONS — unified for text + drawings
    // ============================================================
    // Both DM text and drawings go through MessagingStyle, so a
    // conversation thread stays one notification — exactly like WhatsApp.
    // ============================================================
    private fun showChatNotification(data: Map<String, String>, isDrawing: Boolean) {
        val senderName = data["sender_name"] ?: "Unknown"
        val conversationId = data["conversation_id"] ?: "default_chat"
        val notificationId = conversationId.hashCode()

        val messageBody = if (isDrawing) {
            data["message_body"] ?: "🎨 Sent a drawing"
        } else {
            data["message_body"] ?: ""
        }

        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        // Sender avatar — circular-cropped for the LargeIcon and Person
        val rawAvatar = getBitmapFromUrl(data["sender_img"])
        val avatarBitmap = rawAvatar?.let { circularBitmap(it) }

        val senderPerson = Person.Builder()
            .setName(senderName)
            .setKey(data["sender_id"] ?: senderName) // stable key for grouping
            .apply { if (avatarBitmap != null) setIcon(IconCompat.createWithBitmap(avatarBitmap)) }
            .build()

        val me = Person.Builder().setName("Me").setKey("me").build()

        // Publish a sharing shortcut for this conversation. This is what makes
        // Android render the sender's avatar in the collapsed notification
        // (the "Conversations" section on Android 11+). Without a shortcut,
        // the system falls back to the SmallIcon (launcher).
        if (avatarBitmap != null) {
            publishConversationShortcut(conversationId, senderName, senderPerson, avatarBitmap)
        }

        // Resume prior conversation history if a notification is already showing
        val style: NotificationCompat.MessagingStyle =
            restoreOrCreateMessagingStyle(nm, notificationId, me)
        style.conversationTitle = senderName // shown when group is collapsed
        style.isGroupConversation = false

        // Add the new message. For drawings: attach the image as a data message
        // so it renders inline in the expanded thread (WhatsApp behavior).
        val newMessage = NotificationCompat.MessagingStyle.Message(
            messageBody,
            System.currentTimeMillis(),
            senderPerson
        )
        if (isDrawing) {
            val drawingUrl = data["image_url"]
            if (!drawingUrl.isNullOrEmpty()) {
                // Try to attach the drawing inline. Requires a content:// URI;
                // for a remote URL we fall back to text + LargeIcon.
                val drawingBitmap = getBitmapFromUrl(drawingUrl)
                if (drawingBitmap != null) {
                    val uri =
                        bitmapToContentUri(drawingBitmap, "drawing_${System.currentTimeMillis()}")
                    if (uri != null) {
                        newMessage.setData("image/png", uri)
                    }
                }
            }
        }
        style.addMessage(newMessage)

        val builder = NotificationCompat.Builder(this, CHAT_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_name)
            .setStyle(style)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setGroup(GROUP_KEY_CHATS)
            .setShortcutId(conversationId) // matches the published shortcut above
            .setLocusId(LocusIdCompat(conversationId))
            .addPerson(senderPerson) // additional hint that this is a conversation
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setContentIntent(buildTapIntent(data, notificationId))

        if (avatarBitmap != null) {
            // LargeIcon = the avatar shown on the collapsed card (WhatsApp behavior)
            builder.setLargeIcon(avatarBitmap)
        }

        nm.notify(notificationId, builder.build())
        updateChatGroupSummary(nm)
    }

    private fun restoreOrCreateMessagingStyle(
        nm: NotificationManager,
        notificationId: Int,
        me: Person
    ): NotificationCompat.MessagingStyle {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val existing = nm.activeNotifications.find { it.id == notificationId }
            if (existing != null) {
                val old: NotificationCompat.MessagingStyle? =
                    NotificationCompat.MessagingStyle
                        .extractMessagingStyleFromNotification(existing.notification)
                if (old != null) {
                    return old
                }
            }
        }
        return NotificationCompat.MessagingStyle(me)
    }

    // ============================================================
    // CHAT GROUP SUMMARY
    // ============================================================
    // The summary appears when the user has notifications from multiple
    // conversations. Android automatically renders per-child previews,
    // so we only need a clean summary card with a count.
    // ============================================================
    private fun updateChatGroupSummary(nm: NotificationManager) {
        val (conversationCount, totalMessages) = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val chatNotifs = nm.activeNotifications.filter {
                it.notification.group == GROUP_KEY_CHATS && it.id != CHAT_SUMMARY_ID
            }
            val total = chatNotifs.sumOf { sbn ->
                NotificationCompat.MessagingStyle
                    .extractMessagingStyleFromNotification(sbn.notification)
                    ?.messages?.size ?: 1
            }
            chatNotifs.size to total
        } else {
            1 to 1
        }

        val summaryText = when {
            conversationCount <= 1 -> "$totalMessages new message${if (totalMessages == 1) "" else "s"}"
            else -> "$totalMessages messages from $conversationCount chats"
        }

        val summary = NotificationCompat.Builder(this, CHAT_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_name)
            .setContentTitle("Sketchmate")
            .setContentText(summaryText)
            .setStyle(NotificationCompat.InboxStyle().setSummaryText(summaryText))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setGroup(GROUP_KEY_CHATS)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .setContentIntent(buildTapIntent(emptyMap(), CHAT_SUMMARY_ID))
            .build()

        nm.notify(CHAT_SUMMARY_ID, summary)
    }

    // ============================================================
    // SYSTEM NOTIFICATIONS (mate request / accepted)
    // ============================================================
    private fun showSystemNotification(data: Map<String, String>) {
        val senderName = data["sender_name"] ?: "Someone"
        val messageBody = data["message_body"] ?: ""
        val type = data["type"] ?: ""

        val notificationId = (senderName + type).hashCode()
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        val avatarBitmap = getBitmapFromUrl(data["sender_img"])?.let { circularBitmap(it) }

        val builder = NotificationCompat.Builder(this, SYSTEM_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_name)
            .setContentTitle(senderName)
            .setContentText(messageBody)
            .setStyle(NotificationCompat.BigTextStyle().bigText(messageBody))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setGroup(GROUP_KEY_ALERTS)
            .setContentIntent(buildTapIntent(data, notificationId))

        if (avatarBitmap != null) {
            builder.setLargeIcon(avatarBitmap)
        }

        nm.notify(notificationId, builder.build())
        updateAlertsGroupSummary(nm)
    }

    private fun updateAlertsGroupSummary(nm: NotificationManager) {
        val count = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            nm.activeNotifications.count {
                it.notification.group == GROUP_KEY_ALERTS && it.id != ALERT_SUMMARY_ID
            }
        } else 1

        val summary = NotificationCompat.Builder(this, SYSTEM_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_name)
            .setContentTitle("Sketchmate")
            .setContentText("$count new alert${if (count == 1) "" else "s"}")
            .setStyle(
                NotificationCompat.InboxStyle()
                    .setSummaryText("$count new alert${if (count == 1) "" else "s"}")
            )
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setGroup(GROUP_KEY_ALERTS)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .build()

        nm.notify(ALERT_SUMMARY_ID, summary)
    }

    private fun showLobbyNotification(data: Map<String, String>) {
        val senderName = data["sender_name"] ?: "Someone"
        val lobbyId = data["lobby_id"] ?: return
        val notificationId = ("lobby_$lobbyId").hashCode()
        // Treat the lobby as its own "conversation" for shortcut/locus purposes
        val conversationId = "lobby_$lobbyId"

        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager

        val rawAvatar = getBitmapFromUrl(data["sender_img"])
        val avatarBitmap = rawAvatar?.let { circularBitmap(it) }

        val senderPerson = Person.Builder()
            .setName(senderName)
            .setKey(data["sender_id"] ?: senderName)
            .apply { if (avatarBitmap != null) setIcon(IconCompat.createWithBitmap(avatarBitmap)) }
            .build()

        val me = Person.Builder().setName("Me").setKey("me").build()

        // Publish shortcut so Android promotes this to a conversation-style
        // notification and renders the avatar in the collapsed card.
        if (avatarBitmap != null) {
            publishConversationShortcut(conversationId, senderName, senderPerson, avatarBitmap)
        }

        val style = NotificationCompat.MessagingStyle(me)
            .setConversationTitle("Drawing invitation")
            .setGroupConversation(false)
            .addMessage(
                NotificationCompat.MessagingStyle.Message(
                    "Wants to draw with you 🎨 Tap to join",
                    System.currentTimeMillis(),
                    senderPerson
                )
            )

        val tapIntent = buildTapIntent(data, notificationId)

        val builder = NotificationCompat.Builder(this, LOBBY_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_name)
            .setStyle(style)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setContentIntent(tapIntent)
            .addAction(0, "Join", tapIntent)
            .setAutoCancel(true)
            .setShortcutId(conversationId)
            .setLocusId(LocusIdCompat(conversationId))
            .addPerson(senderPerson)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)

        if (avatarBitmap != null) {
            builder.setLargeIcon(avatarBitmap)
        }

        nm.notify(notificationId, builder.build())
    }

    // ============================================================
    // UTILITIES
    // ============================================================

    /**
     * Publishes a long-lived sharing shortcut so Android's conversation-style
     * notification can render the sender's avatar in the collapsed view.
     * Required on Android 11+ for the notification to be promoted to a
     * "conversation" with proper avatar rendering.
     */
    private fun publishConversationShortcut(
        conversationId: String,
        senderName: String,
        senderPerson: Person,
        avatarBitmap: Bitmap
    ) {
        try {
            // Intent the shortcut "launches" — tapping in launcher would open chat.
            // Notifications don't actually use this for tapping (setContentIntent does),
            // but a launch intent is required for ShortcutInfoCompat.
            val openChatIntent = Intent(Intent.ACTION_VIEW).apply {
                setData(Uri.parse("sketchmate://chat/$conversationId"))
                action = Intent.ACTION_VIEW
            }

            val shortcut = ShortcutInfoCompat.Builder(this, conversationId)
                .setShortLabel(senderName)
                .setLongLabel(senderName)
                .setIcon(IconCompat.createWithBitmap(avatarBitmap))
                .setPerson(senderPerson)
                .setLongLived(true) // required for conversation-style notifications
                .setIntent(openChatIntent)
                .setCategories(setOf("ninja.sketchmate.category.TEXT_SHARE_TARGET"))
                .setLocusId(LocusIdCompat(conversationId))
                .build()

            ShortcutManagerCompat.pushDynamicShortcut(this, shortcut)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun getBitmapFromUrl(urlStr: String?): Bitmap? {
        if (urlStr.isNullOrEmpty()) return null
        return try {
            val url = URL(urlStr)
            val conn = url.openConnection()
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            BitmapFactory.decodeStream(conn.getInputStream())
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    /** Crops to a circle — Android won't auto-circle LargeIcons. */
    private fun circularBitmap(source: Bitmap): Bitmap {
        val size = minOf(source.width, source.height)
        val output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(output)
        val paint = Paint().apply { isAntiAlias = true }
        val path = Path().apply {
            addCircle(size / 2f, size / 2f, size / 2f, Path.Direction.CCW)
        }
        canvas.clipPath(path)
        val left = ((size - source.width) / 2f)
        val top = ((size - source.height) / 2f)
        canvas.drawBitmap(source, left, top, paint)
        return output
    }

    /**
     * MessagingStyle.Message.setData() requires a content:// URI it can read.
     * We persist the bitmap to cache and expose via FileProvider.
     *
     * Requires in AndroidManifest.xml:
     *   <provider
     *     android:name="androidx.core.content.FileProvider"
     *     android:authorities="${applicationId}.fileprovider"
     *     android:exported="false"
     *     android:grantUriPermissions="true">
     *     <meta-data
     *       android:name="android.support.FILE_PROVIDER_PATHS"
     *       android:resource="@xml/file_paths" />
     *   </provider>
     *
     * file_paths.xml: <cache-path name="notif_images" path="notification_images/" />
     */
    private fun bitmapToContentUri(bitmap: Bitmap, name: String): Uri? {
        return try {
            val dir = File(cacheDir, "notification_images").apply { mkdirs() }
            val file = File(dir, "$name.png")
            FileOutputStream(file).use { out ->
                bitmap.compress(Bitmap.CompressFormat.PNG, 90, out)
            }
            FileProvider.getUriForFile(
                this,
                "${packageName}.fileprovider",
                file
            )
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private fun buildTapIntent(
        data: Map<String, String>,
        requestCode: Int
    ): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP

            // Pass the unique notification ID to MainActivity so it can dismiss it on start
            putExtra("EXTRA_NOTIFICATION_ID", requestCode)

            for ((key, value) in data) {
                putExtra(key, value)
            }
            putExtra("google.message_id", data["google.message_id"] ?: "")
        }

        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }

        return PendingIntent.getActivity(this, requestCode, intent, flags)
    }

    private fun isAppInForeground(): Boolean {
        val activityManager = getSystemService(ACTIVITY_SERVICE) as android.app.ActivityManager
        val appProcesses = activityManager.runningAppProcesses ?: return false
        val packageName = packageName
        for (appProcess in appProcesses) {
            if (appProcess.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
                && appProcess.processName == packageName) {
                return true
            }
        }
        return false
    }
}