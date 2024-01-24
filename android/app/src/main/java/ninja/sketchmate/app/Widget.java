package ninja.sketchmate.app;

import static android.content.Context.MODE_PRIVATE;

import android.app.Activity;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.net.Uri;
import android.widget.RemoteViews;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.reflect.TypeToken;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

public class Widget extends AppWidgetProvider {

    public static String FRIENDCLICK = "FRIENDCLICK";

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (Objects.equals(intent.getAction(), FRIENDCLICK)) {
            String friendId = intent.getStringExtra("friendID");
            String friendName = intent.getStringExtra("friendName");
            String friendImg = intent.getStringExtra("friendImg");
            int appWidgetId = intent.getIntExtra("appwidgetID", 0);
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            onFriendClick(context, appWidgetManager, appWidgetId, friendId, friendName, friendImg);
        }
    }

    static void displayInboxItem(Context context, AppWidgetManager appWidgetManager,
                                 int appWidgetId, String imageUrl, String inboxId) {
        if (imageUrl.equals("")) return;
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_image);

        Mate mate = retrieveWidgetFriendMapping(context, appWidgetId);
        views.setTextViewText(R.id.widget_image_user, mate.getName());


        // Create a new thread to load the image
        new Thread(() -> {
            try {
                InputStream in = new java.net.URL(imageUrl).openStream();
                Bitmap bitmap = BitmapFactory.decodeStream(in);
                int cornerRadiusPixels = 30; // Set the desired corner radius in pixels


                views.setImageViewBitmap(R.id.widget_image_drawing, getRoundedCornerBitmap(bitmap, cornerRadiusPixels));

                InputStream inAvatar = new java.net.URL(mate.getImg()).openStream();
                Bitmap bitmapAvatar = BitmapFactory.decodeStream(inAvatar);
                views.setImageViewBitmap(R.id.widget_image_avatar, WidgetGridFactory.getRoundedBitmap(bitmapAvatar));


            } catch (Exception e) {
                e.printStackTrace();
            }

            String url = "https://app.sketchmate.ninja/gallery?item=" + inboxId;

            // Make the widget interactive
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.setPackage(context.getPackageName());
            PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_MUTABLE);
            views.setOnClickPendingIntent(R.id.widget_image_drawing, pendingIntent);


            appWidgetManager.updateAppWidget(appWidgetId, views);
        }).start();
    }


    public static void handleDrawingReceived(Context context, String friendID, String imageUrl, String inboxId) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(new ComponentName(context, Widget.class));
        for (int appWidgetId : appWidgetIds) {
            Mate mate = retrieveWidgetFriendMapping(context, appWidgetId);
            if (mate.get_id().equals(friendID))
                displayInboxItem(context, appWidgetManager, appWidgetId, imageUrl, inboxId);
        }
    }

    public static void handleUnmatch(Context context, String friendID, String unmatcher) {
        AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
        int[] appWidgetIds = appWidgetManager.getAppWidgetIds(new ComponentName(context, Widget.class));
        for (int appWidgetId : appWidgetIds) {
            Mate mate = retrieveWidgetFriendMapping(context, appWidgetId);
            if (mate.get_id().equals(friendID))
                renderUnmatchView(context, appWidgetManager, appWidgetId, mate.getName(), !unmatcher.equals(friendID));
        }
    }


    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        // There may be multiple widgets active, so update all of them
        for (int appWidgetId : appWidgetIds) {
            SharedPreferences preferences = context.getSharedPreferences("widget_preferences", MODE_PRIVATE);
            if (!preferences.getBoolean("friendSelected_" + appWidgetId, false)) {
                retrieveFriends(context, appWidgetManager, appWidgetId);
                preferences.edit().putBoolean("friendSelected_" + appWidgetId, true).apply();
            }
        }
        super.onUpdate(context, appWidgetManager, appWidgetIds);
    }

    private void retrieveFriends(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        renderLoading(context, appWidgetManager, appWidgetId);
        SharedPreferences preferences = context.getSharedPreferences("CapacitorStorage", Activity.MODE_PRIVATE);
        String userID = preferences.getString("user_id", null);
        String backendURL = preferences.getString("backend_url", null);

        if (userID == null || backendURL == null) {
            renderNotLoggedInView(context, appWidgetManager, appWidgetId);
        }


        // Ensure that userID and backendURL are not null before making the request
        new Thread(() -> {
            try {
                // Construct the URL with parameters
                URL url = new URL(backendURL + "/user/mates?user_id=" + userID);

                // Open connection
                HttpURLConnection urlConnection = (HttpURLConnection) url.openConnection();

                try {
                    // Set request method
                    urlConnection.setRequestMethod("GET");

                    // Read the response
                    InputStream in = new BufferedInputStream(urlConnection.getInputStream());
                    // Process the InputStream as needed
                    String response = readStream(in);
                    List<Mate> friendsList = parseFriends(response);
                    onFriendsReceived(context, appWidgetManager, appWidgetId, friendsList);

                } finally {
                    // Disconnect the connection
                    urlConnection.disconnect();
                }
            } catch (Exception e) {
                e.printStackTrace();
                // Handle exceptions
            }
        }).start();
    }

    private void onFriendsReceived(Context context, AppWidgetManager appWidgetManager, int appWidgetId, List<Mate> friends) {
        if (friends.size() == 0) renderNoFriendsView(context, appWidgetManager, appWidgetId);
        else {
            renderFriendsListView(context, appWidgetManager, appWidgetId, friends);
        }
    }

    private void renderFriendsListView(Context context, AppWidgetManager appWidgetManager, int appWidgetId, List<Mate> friends) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_friends);
        views.setTextViewText(R.id.widget_friends_title, "Select friend");

        Intent gridServiceIntent = new Intent(context, WidgetGridService.class);
        gridServiceIntent.putParcelableArrayListExtra("friends", new ArrayList<>(friends));
        gridServiceIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        gridServiceIntent.setData(Uri.parse(gridServiceIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_friends_grid, gridServiceIntent);


        Intent toastIntent = new Intent(context, Widget.class);
        // Set the action for the intent.
        // When the user touches a particular view, it has the effect of
        // broadcasting TOAST_ACTION.
        toastIntent.setAction(FRIENDCLICK);

        PendingIntent toastPendingIntent = PendingIntent.getBroadcast(context, 0, toastIntent,
                PendingIntent.FLAG_MUTABLE);

        views.setPendingIntentTemplate(R.id.widget_friends_grid, toastPendingIntent);


        // Update the widget
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private void onFriendClick(Context context, AppWidgetManager appWidgetManager,
                               int appWidgetId, String friendID, String friendName, String friendImg) {
        renderLoading(context, appWidgetManager, appWidgetId);
        storeWidgetFriendMapping(context, appWidgetId, friendID, friendName, friendImg);
        SharedPreferences preferences = context.getSharedPreferences("CapacitorStorage", Activity.MODE_PRIVATE);
        String backendURL = preferences.getString("backend_url", null);
        String userID = preferences.getString("user_id", null);

        if (backendURL != null) {
            new Thread(() -> {
                try {
                    // Construct the URL with parameters
                    URL url = new URL(backendURL + "/user/drawing?friend_id=" + friendID + "&user_id=" + userID);

                    // Open connection
                    HttpURLConnection urlConnection = (HttpURLConnection) url.openConnection();

                    try {
                        // Set request method
                        urlConnection.setRequestMethod("GET");

                        // Read the response
                        InputStream in = new BufferedInputStream(urlConnection.getInputStream());
                        // Process the InputStream as needed
                        String response = readStream(in);
                        if (response.isEmpty()) {
                            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_error);
                            views.setTextViewText(R.id.widget_no_friends_text1, friendName + " hasn't sent you anything yet...");
                            views.setTextViewText(R.id.widget_no_friends_text2, "");

                            appWidgetManager.updateAppWidget(appWidgetId, views);
                        } else {
                            // Process the response
                            Gson gson = new Gson();
                            JsonObject jsonResponse = gson.fromJson(response, JsonObject.class);

                            // Access individual properties
                            String img = jsonResponse.get("img").getAsString();
                            String _id = jsonResponse.get("_id").getAsString();
                            displayInboxItem(context, appWidgetManager, appWidgetId, img, _id);
                        }
                    } finally {
                        // Disconnect the connection
                        urlConnection.disconnect();
                    }
                } catch (Exception e) {
                    e.printStackTrace();
                    // Handle exceptions
                }
            }).start();
        }
    }


    private void renderNoFriendsView(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_error);
        views.setTextViewText(R.id.widget_no_friends_text1, "This widget shows the latest drawing of a friend");
        views.setTextViewText(R.id.widget_no_friends_text2, "Come back once you have friends :)");

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private void renderNotLoggedInView(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_error);
        views.setTextViewText(R.id.widget_no_friends_text1, "Not logged in");
        views.setTextViewText(R.id.widget_no_friends_text2, "Login and try again");

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private static void renderUnmatchView(Context context, AppWidgetManager appWidgetManager, int appWidgetId, String friendName, boolean isUnmatcher) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_error);
        if (isUnmatcher)
            views.setTextViewText(R.id.widget_no_friends_text1, "You unmatched " + friendName);
        else views.setTextViewText(R.id.widget_no_friends_text1, friendName + " unmatched you");
        views.setTextViewText(R.id.widget_no_friends_text2, "Delete this widget");

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private void renderLoading(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_loading);
        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private List<Mate> parseFriends(String response) {
        try {
            Gson gson = new Gson();
            TypeToken<List<Mate>> typeToken = new TypeToken<List<Mate>>() {
            };
            return gson.fromJson(response, typeToken.getType());
        } catch (Exception e) {
            e.printStackTrace();
            // Handle parsing exceptions
            return new ArrayList<>(); // Return an empty list in case of an error
        }
    }


    private String readStream(InputStream is) throws IOException {
        // Convert InputStream to String
        BufferedReader reader = new BufferedReader(new InputStreamReader(is));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) {
            sb.append(line).append('\n');
        }
        reader.close();
        return sb.toString();
    }

    private void storeWidgetFriendMapping(Context context, int appWidgetId, String friendID, String friendName, String friendImg) {
        SharedPreferences preferences = context.getSharedPreferences("WidgetMappings", Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = preferences.edit();
        editor.putString("widget_" + appWidgetId + "_friend_id", friendID);
        editor.putString("widget_" + appWidgetId + "_friend_name", friendName);
        editor.putString("widget_" + appWidgetId + "_friend_img", friendImg);
        editor.apply(); // Commit the changes to SharedPreferences
    }

    private static Mate retrieveWidgetFriendMapping(Context context, int appWidgetId) {
        SharedPreferences preferences = context.getSharedPreferences("WidgetMappings", Context.MODE_PRIVATE);
        String friendID = preferences.getString("widget_" + appWidgetId + "_friend_id", null);
        String friendName = preferences.getString("widget_" + appWidgetId + "_friend_name", null);
        String friendImg = preferences.getString("widget_" + appWidgetId + "_friend_img", null);
        return new Mate(friendID, friendName, friendImg);
    }


    @Override
    public void onEnabled(Context context) {
        // Enter relevant functionality for when the first widget is created
    }

    @Override
    public void onDisabled(Context context) {
        // Enter relevant functionality for when the last widget is disabled
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        // Remove the boolean flag when the widget is deleted
        SharedPreferences preferences = context.getSharedPreferences("widget_preferences", MODE_PRIVATE);
        SharedPreferences.Editor editor = preferences.edit();

        for (int appWidgetId : appWidgetIds) {
            editor.remove("friendSelected_" + appWidgetId);
        }

        editor.apply();

        super.onDeleted(context, appWidgetIds);
        System.out.println("deleted");
    }

    private static Bitmap getRoundedCornerBitmap(Bitmap bitmap, int cornerRadius) {
        Bitmap output = Bitmap.createBitmap(bitmap.getWidth(), bitmap.getHeight(), Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);

        final Paint paint = new Paint();
        final Rect rect = new Rect(0, 0, bitmap.getWidth(), bitmap.getHeight());
        final RectF rectF = new RectF(rect);

        paint.setAntiAlias(true);
        canvas.drawARGB(0, 0, 0, 0);
        paint.setColor(Color.BLACK);
        canvas.drawRoundRect(rectF, cornerRadius, cornerRadius, paint);

        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(bitmap, rect, rect, paint);

        return output;
    }

}