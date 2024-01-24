package ninja.sketchmate.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
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
import android.os.Bundle;
import android.os.Parcelable;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

// WidgetGridFactory.java
public class WidgetGridFactory implements RemoteViewsService.RemoteViewsFactory {
    private Context context;
    private List<Mate> friends;
    private int appWidgetID;

    WidgetGridFactory(Context context, Intent intent) {
        this.context = context;
        this.friends = getDataFromIntent(intent);
        this.appWidgetID = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, 0);
    }

    private List<Mate> getDataFromIntent(Intent intent) {
        List<Mate> friendList = intent.getParcelableArrayListExtra("friends");
        if (friendList == null) {
            friendList = new ArrayList<>();
        }
        return friendList;
    }


    @Override
    public void onCreate() {
        ;
    }

    @Override
    public void onDataSetChanged() {
        // Refresh the data, if needed
    }

    @Override
    public void onDestroy() {
        // Clean up resources
    }

    @Override
    public int getCount() {
        return friends.size();
    }

    @Override
    public RemoteViews getViewAt(int position) {
        if (position < 0 || position >= getCount()) {
            return null;
        }

        // Get the data for the current position
        Mate friend = friends.get(position);

        // Create a RemoteViews for the item
        RemoteViews remoteViews = new RemoteViews(context.getPackageName(), R.layout.widget_friends_item);

        // Set data on the RemoteViews (assuming IDs match your widget_friends_item_layout)
        remoteViews.setTextViewText(R.id.widget_friends_item_text, friend.getName());

        InputStream in = null;
        try {
            in = new java.net.URL(friend.getImg()).openStream();
            Bitmap bitmap = BitmapFactory.decodeStream(in);
            remoteViews.setImageViewBitmap(R.id.widget_friends_item_image, getRoundedBitmap(bitmap));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }

        Intent fillInIntent = new Intent();
        Bundle extras = new Bundle();
        fillInIntent.putExtra("friendID", friend.get_id());
        fillInIntent.putExtra("friendName", friend.getName());
        fillInIntent.putExtra("friendImg", friend.getImg());
        fillInIntent.putExtra("appwidgetID", appWidgetID);
        remoteViews.setOnClickFillInIntent(R.id.widget_friends_item, fillInIntent);

        fillInIntent.putExtras(extras);


        return remoteViews;
    }

    @Override
    public RemoteViews getLoadingView() {
        // Optionally, provide a loading view
        return null;
    }

    @Override
    public int getViewTypeCount() {
        // Return the number of view types (typically 1)
        return 1;
    }

    @Override
    public long getItemId(int position) {
        // Return a unique item ID for the item at the given position
        return position;
    }

    @Override
    public boolean hasStableIds() {
        // Return true if the item IDs are stable across changes
        return true;
    }

    public static Bitmap getRoundedBitmap(Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int radius = Math.min(width, height) / 2;

        Bitmap output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(output);

        final Paint paint = new Paint();
        final Rect rect = new Rect(0, 0, width, height);

        paint.setAntiAlias(true);
        canvas.drawARGB(0, 0, 0, 0);
        paint.setColor(Color.parseColor("#FF0000")); // Replace with your desired background color
        canvas.drawRoundRect(new RectF(rect), radius, radius, paint);

        paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
        canvas.drawBitmap(bitmap, rect, rect, paint);

        return output;
    }
}