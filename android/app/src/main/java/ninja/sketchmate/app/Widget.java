package ninja.sketchmate.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.net.Uri;
import android.util.Log;
import android.widget.RemoteViews;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class Widget extends AppWidgetProvider {

    private static final String ACTION_NEXT = "ninja.sketchmate.app.ACTION_NEXT";
    private static final String ACTION_PREV = "ninja.sketchmate.app.ACTION_PREV";
    private static final String ACTION_RESET = "ninja.sketchmate.app.ACTION_RESET";
    private static final String PREFS_NAME = "WidgetPrefs";

    // RemoteViews bitmaps are parceled across a Binder transaction to the
    // launcher process, which has a hard ~1MB ceiling. Anything larger throws
    // and can take the launcher (or us) down, so we cap every bitmap we send.
    private static final int MAX_REMOTEVIEW_BYTES = 900 * 1024;
    private static final int DRAWING_MAX_PX = 480;   // 480*480*4 ≈ 900KB worst case
    private static final int AVATAR_MAX_PX = 160;    // crisp at 44dp on xxhdpi

    // Backend is fixed and Capacitor Preferences doesn't reliably persist a
    // "backend_url" key into CapacitorStorage, so reading it here often returned
    // null → a permanent "Not logged in" error that no retry could clear.
    // Hardcode it; keep VITE_BACKEND=https://server.sketchmate.ninja in sync.
    private static final String BACKEND_URL = "https://server.sketchmate.ninja";

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (!ACTION_NEXT.equals(action) && !ACTION_PREV.equals(action) && !ACTION_RESET.equals(action)) {
            return;
        }

        int appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int offset = prefs.getInt("offset_" + appWidgetId, 0);

        int next;
        if (ACTION_RESET.equals(action)) {
            next = 0;
        } else if (ACTION_PREV.equals(action)) {
            next = Math.max(0, offset - 1);   // clamp at newest
        } else {
            next = offset + 1;
        }

        prefs.edit().putInt("offset_" + appWidgetId, next).apply();
        updateWidget(context, AppWidgetManager.getInstance(context), appWidgetId);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Activity.MODE_PRIVATE);
        String userID = prefs.getString("user_id", null);
        String backendURL = BACKEND_URL;

        if (userID == null) {
            renderError(context, appWidgetManager, appWidgetId, "Not logged in", "Tap to refresh");
            return;
        }

        renderLoading(context, appWidgetManager, appWidgetId);

        SharedPreferences widgetPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int offset = widgetPrefs.getInt("offset_" + appWidgetId, 0);

        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(backendURL + "/user/inbox/latest?user_id=" + userID + "&offset=" + offset);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);

                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    String response = readStream(conn.getInputStream());
                    if (response == null || response.trim().equals("null") || response.isEmpty()) {
                        renderError(context, appWidgetManager, appWidgetId, "Inbox is empty", "Tap to refresh");
                    } else {
                        JsonObject json = new Gson().fromJson(response, JsonObject.class);
                        String image = optString(json, "image");
                        String id = optString(json, "_id");

                        if (image == null || id == null) {
                            // Well-formed JSON but no usable item — treat as empty, not a crash.
                            renderError(context, appWidgetManager, appWidgetId, "Inbox is empty", "Tap to refresh");
                        } else {
                            String senderName = json.has("senderName") ? optString(json, "senderName") : "Unknown";
                            String senderImg = json.has("senderImg") ? optString(json, "senderImg") : "";
                            displayInboxItem(context, appWidgetManager, appWidgetId, image, id,
                                    senderName != null ? senderName : "Unknown",
                                    senderImg != null ? senderImg : "");
                        }
                    }
                } else if (responseCode == 404) {
                    renderError(context, appWidgetManager, appWidgetId, "Image deleted", "Tap next to skip");
                } else {
                    renderError(context, appWidgetManager, appWidgetId, "Server error", "Tap to try again");
                }
            } catch (Throwable e) {
                Log.e("Widget", "Update failed", e);
                renderError(context, appWidgetManager, appWidgetId, "Connection failed", "Tap to retry");
            } finally {
                if (conn != null) conn.disconnect();
            }
        }).start();
    }

    private void displayInboxItem(Context context, AppWidgetManager appWidgetManager, int appWidgetId,
                                  String imageUrl, String inboxId, String senderName, String senderImg) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_image);

        try {
            // Top bar: sender name + circular avatar (real views, off the image).
            views.setTextViewText(R.id.widget_image_user, senderName);
            if (senderImg != null && !senderImg.trim().isEmpty()) {
                try {
                    Bitmap rawAvatar = loadScaledBitmapFromUrl(senderImg, AVATAR_MAX_PX);
                    if (rawAvatar != null) {
                        Bitmap circleAvatar = getCircularBitmap(rawAvatar);
                        rawAvatar.recycle();
                        views.setImageViewBitmap(R.id.widget_image_avatar, circleAvatar);
                    }
                } catch (Throwable e) {
                    Log.e("Widget", "Avatar load failed", e);
                }
            }

            // Whole drawing (no crop → fitCenter shows all of it) with rounded corners,
            // capped to the Binder budget.
            Bitmap rawDrawing = loadScaledBitmapFromUrl(imageUrl, DRAWING_MAX_PX);
            if (rawDrawing != null) {
                Bitmap roundedDrawing = getRoundedCornerBitmap(rawDrawing, 30);
                rawDrawing.recycle();
                roundedDrawing = capForRemoteViews(roundedDrawing);
                views.setImageViewBitmap(R.id.widget_image_drawing, roundedDrawing);
            }

            // Setup Intents
            setupIntents(context, views, appWidgetId, inboxId);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        } catch (Throwable e) {
            // Catch Throwable, not Exception: OutOfMemoryError is an Error and would
            // otherwise crash the process instead of degrading to an error card.
            Log.e("Widget", "Display failed", e);
            renderError(context, appWidgetManager, appWidgetId, "Memory/Image error", "Tap to reload");
        }
    }

    private Bitmap loadScaledBitmapFromUrl(String urlString, int maxSize) throws IOException {
        // Pass 1: bounds-only decode to read the intrinsic size.
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        InputStream boundsIn = null;
        try {
            boundsIn = new URL(urlString).openStream();
            BitmapFactory.decodeStream(boundsIn, null, options);
        } finally {
            if (boundsIn != null) boundsIn.close();
        }

        // Pass 2: real decode WITH the computed sample size applied. The previous
        // version dropped `options` here, so inSampleSize was never used and full
        // resolution bitmaps were loaded → OOM crashes ("Memory/Image error").
        options.inSampleSize = calculateInSampleSize(options, maxSize);
        options.inPreferredConfig = Bitmap.Config.ARGB_8888; // alpha needed for rounded corners
        options.inJustDecodeBounds = false;

        InputStream in = null;
        try {
            in = new URL(urlString).openStream();
            return BitmapFactory.decodeStream(in, null, options);
        } finally {
            if (in != null) in.close();
        }
    }

    // Shrink so BOTH dimensions end up <= maxSize. The old version required both
    // half-dims to stay >= the target, so a wide/tall (non-square) image barely
    // sampled and decoded at near-full resolution — the main OOM trigger.
    private static int calculateInSampleSize(BitmapFactory.Options options, int maxSize) {
        int height = options.outHeight;
        int width = options.outWidth;
        int inSampleSize = 1;
        while ((height / inSampleSize) > maxSize || (width / inSampleSize) > maxSize) {
            inSampleSize *= 2;
        }
        return inSampleSize;
    }

    // Final safety net before crossing the Binder boundary: if the bitmap still
    // exceeds the RemoteViews budget, scale it down proportionally. Recycles the
    // source when a smaller copy is produced.
    private Bitmap capForRemoteViews(Bitmap src) {
        if (src == null) return null;
        int bytes = src.getAllocationByteCount();
        if (bytes <= MAX_REMOTEVIEW_BYTES) return src;

        double scale = Math.sqrt((double) MAX_REMOTEVIEW_BYTES / bytes);
        int w = Math.max(1, (int) (src.getWidth() * scale));
        int h = Math.max(1, (int) (src.getHeight() * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(src, w, h, true);
        if (scaled != src) src.recycle();
        return scaled;
    }

    private void setupIntents(Context context, RemoteViews views, int appWidgetId, String inboxId) {
        String url = "https://app.sketchmate.ninja/gallery?item=" + inboxId;
        Intent galleryIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        galleryIntent.setPackage(context.getPackageName());
        PendingIntent galleryPi = PendingIntent.getActivity(context, appWidgetId, galleryIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_image_drawing, galleryPi);

        views.setOnClickPendingIntent(R.id.widget_button_next, offsetIntent(context, appWidgetId, ACTION_NEXT));
        views.setOnClickPendingIntent(R.id.widget_button_prev, offsetIntent(context, appWidgetId, ACTION_PREV));
        views.setOnClickPendingIntent(R.id.widget_button_reset, offsetIntent(context, appWidgetId, ACTION_RESET));
    }

    // Distinct requestCode per (widget, action) so the three PendingIntents don't
    // collide and overwrite each other under FLAG_UPDATE_CURRENT.
    private PendingIntent offsetIntent(Context context, int appWidgetId, String action) {
        Intent intent = new Intent(context, Widget.class);
        intent.setAction(action);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        int requestCode = (appWidgetId * 31) + action.hashCode();
        return PendingIntent.getBroadcast(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void renderError(Context context, AppWidgetManager appWidgetManager, int appWidgetId, String t1, String t2) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_error);
        views.setTextViewText(R.id.widget_no_friends_text1, t1);
        views.setTextViewText(R.id.widget_no_friends_text2, t2);

        Intent intent = new Intent(context, Widget.class);
        intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, new int[]{appWidgetId});
        PendingIntent pi = PendingIntent.getBroadcast(context, appWidgetId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        views.setOnClickPendingIntent(R.id.widget_error_root, pi);
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private void renderLoading(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_loading);
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    // Null-safe JSON string read: returns null for a missing key or JSON null,
    // so a partial payload degrades gracefully instead of NPE-ing.
    private static String optString(JsonObject json, String key) {
        if (json == null || !json.has(key) || json.get(key).isJsonNull()) return null;
        return json.get(key).getAsString();
    }

    private String readStream(InputStream is) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(is));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line).append('\n');
        reader.close();
        return sb.toString();
    }

    // Center-crops to a square, then masks to a circle → a perfect circle even
    // when the source isn't square (e.g. a GIF's first frame). The drawing itself
    // is left uncropped (fitCenter); only the avatar is force-cropped.
    private static Bitmap getCircularBitmap(Bitmap src) {
        int size = Math.min(src.getWidth(), src.getHeight());
        int left = (src.getWidth() - size) / 2;
        int top = (src.getHeight() - size) / 2;

        Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        Paint paint = new Paint();
        paint.setAntiAlias(true);
        float radius = size / 2f;
        canvas.drawCircle(radius, radius, radius, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(src, new Rect(left, top, left + size, top + size),
                new Rect(0, 0, size, size), paint);
        return output;
    }

    private static Bitmap getRoundedCornerBitmap(Bitmap bitmap, int cornerRadius) {
        Bitmap output = Bitmap.createBitmap(bitmap.getWidth(), bitmap.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);
        final Paint paint = new Paint();
        final Rect rect = new Rect(0, 0, bitmap.getWidth(), bitmap.getHeight());
        final RectF rectF = new RectF(rect);
        paint.setAntiAlias(true);
        canvas.drawRoundRect(rectF, cornerRadius, cornerRadius, paint);
        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(bitmap, rect, rect, paint);
        return output;
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        for (int appWidgetId : appWidgetIds) {
            editor.remove("offset_" + appWidgetId);
        }
        editor.apply();
        super.onDeleted(context, appWidgetIds);
    }
}