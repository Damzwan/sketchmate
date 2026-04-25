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

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class Widget extends AppWidgetProvider {

    private static final String ACTION_NEXT = "ninja.sketchmate.app.ACTION_NEXT";
    private static final String PREFS_NAME = "WidgetPrefs";

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_NEXT.equals(intent.getAction())) {
            int appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
            if (appWidgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                int currentOffset = prefs.getInt("offset_" + appWidgetId, 0);
                prefs.edit().putInt("offset_" + appWidgetId, currentOffset + 1).apply();
                updateWidget(context, AppWidgetManager.getInstance(context), appWidgetId);
            }
        }
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
        String backendURL = prefs.getString("backend_url", null);

        if (userID == null || backendURL == null) {
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
                        String image = json.get("image").getAsString();
                        String id = json.get("_id").getAsString();
                        String senderName = json.has("senderName") ? json.get("senderName").getAsString() : "Unknown";
                        String senderImg = json.has("senderImg") ? json.get("senderImg").getAsString() : "";

                        displayInboxItem(context, appWidgetManager, appWidgetId, image, id, senderName, senderImg);
                    }
                } else if (responseCode == 404) {
                    renderError(context, appWidgetManager, appWidgetId, "Image deleted", "Tap next to skip");
                } else {
                    renderError(context, appWidgetManager, appWidgetId, "Server error", "Tap to try again");
                }
            } catch (Exception e) {
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
            // 1. Load Main Drawing with Downsampling
            Bitmap rawDrawing = loadScaledBitmapFromUrl(imageUrl, 800);
            if (rawDrawing != null) {
                Bitmap roundedDrawing = getRoundedCornerBitmap(rawDrawing, 30);
                views.setImageViewBitmap(R.id.widget_image_drawing, roundedDrawing);
                rawDrawing.recycle(); // Important: free memory immediately
            }

            views.setTextViewText(R.id.widget_image_user, senderName);

            // 2. Load Avatar
            if (senderImg != null && !senderImg.trim().isEmpty()) {
                try {
                    Bitmap rawAvatar = loadScaledBitmapFromUrl(senderImg, 100);
                    if (rawAvatar != null) {
                        int radius = Math.min(rawAvatar.getWidth(), rawAvatar.getHeight()) / 2;
                        Bitmap roundedAvatar = getRoundedCornerBitmap(rawAvatar, radius);
                        views.setImageViewBitmap(R.id.widget_image_avatar, roundedAvatar);
                        rawAvatar.recycle();
                    }
                } catch (Exception e) {
                    Log.e("Widget", "Avatar load failed", e);
                }
            }

            // Setup Intents
            setupIntents(context, views, appWidgetId, inboxId);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        } catch (Exception e) {
            Log.e("Widget", "Display failed", e);
            renderError(context, appWidgetManager, appWidgetId, "Memory/Image error", "Tap to reload");
        }
    }

    private Bitmap loadScaledBitmapFromUrl(String urlString, int maxSize) throws IOException {
        InputStream in = new URL(urlString).openStream();
        BufferedInputStream bis = new BufferedInputStream(in);

        // Decode only bounds to check size
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        bis.mark(1024 * 1024); // Mark stream if supported, or just open twice
        BitmapFactory.decodeStream(bis, null, options);

        // Calculate sample size
        options.inSampleSize = calculateInSampleSize(options, maxSize, maxSize);
        options.inJustDecodeBounds = false;

        // Reset stream and decode
        bis.close();
        in = new URL(urlString).openStream();
        Bitmap result = BitmapFactory.decodeStream(in);
        in.close();
        return result;
    }

    private static int calculateInSampleSize(BitmapFactory.Options options, int reqWidth, int reqHeight) {
        final int height = options.outHeight;
        final int width = options.outWidth;
        int inSampleSize = 1;
        if (height > reqHeight || width > reqWidth) {
            final int halfHeight = height / 2;
            final int halfWidth = width / 2;
            while ((halfHeight / inSampleSize) >= reqHeight && (halfWidth / inSampleSize) >= reqWidth) {
                inSampleSize *= 2;
            }
        }
        return inSampleSize;
    }

    private void setupIntents(Context context, RemoteViews views, int appWidgetId, String inboxId) {
        String url = "https://app.sketchmate.ninja/gallery?item=" + inboxId;
        Intent galleryIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        galleryIntent.setPackage(context.getPackageName());
        PendingIntent galleryPi = PendingIntent.getActivity(context, appWidgetId, galleryIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_image_drawing, galleryPi);

        Intent nextIntent = new Intent(context, Widget.class);
        nextIntent.setAction(ACTION_NEXT);
        nextIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        PendingIntent nextPi = PendingIntent.getBroadcast(context, appWidgetId, nextIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_button_next, nextPi);
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

    private String readStream(InputStream is) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(is));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line).append('\n');
        reader.close();
        return sb.toString();
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