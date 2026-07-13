package ninja.sketchmate.app;

import android.app.NotificationManager;
import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Handle dismissal if the app was completely closed/killed
        handleNotificationDismissal(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // Handle dismissal if the app was already running in the background
        handleNotificationDismissal(intent);
    }

    private void handleNotificationDismissal(Intent intent) {
        if (intent == null) return;

        // Check if the intent contains our custom notification ID
        int notificationId = intent.getIntExtra("EXTRA_NOTIFICATION_ID", -1);
        if (notificationId != -1) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(notificationId); // Instantly dismisses the notification
            }
        }
    }
}