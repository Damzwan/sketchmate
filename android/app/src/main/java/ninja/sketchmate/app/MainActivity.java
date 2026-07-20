package ninja.sketchmate.app;

import android.app.NotificationManager;
import android.content.Intent;
import android.os.Bundle;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private int lastImeInsetCssPx = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Handle dismissal if the app was completely closed/killed
        handleNotificationDismissal(getIntent());
        watchImeInset();
    }

    /**
     * The @capacitor/keyboard plugin only emits its keyboard events from a
     * WindowInsetsAnimation callback, i.e. when the IME ANIMATES in or out.
     * Switching between the alphabetic keyboard and the (taller) emoji panel
     * resizes the IME with no insets animation, so the plugin stays silent and
     * the web layer keeps padding for the wrong keyboard height.
     *
     * OnApplyWindowInsets, by contrast, dispatches on EVERY inset change,
     * animated or not. Attached to the content view - not the decor root, where
     * the plugin holds the (single) listener slot - and forwarded to the web
     * layer as a window event carrying the IME height in CSS pixels.
     */
    private void watchImeInset() {
        ViewCompat.setOnApplyWindowInsetsListener(
            findViewById(android.R.id.content),
            (view, insets) -> {
                int imePx = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
                int cssPx = Math.round(imePx / getResources().getDisplayMetrics().density);
                if (cssPx != lastImeInsetCssPx && getBridge() != null) {
                    lastImeInsetCssPx = cssPx;
                    // The bridge copies the JSON's top-level keys onto the JS
                    // event object; nesting under "detail" gives listeners the
                    // familiar CustomEvent shape (event.detail.height).
                    getBridge().triggerWindowJSEvent(
                        "nativeImeInset",
                        "{ \"detail\": { \"height\": " + cssPx + " } }"
                    );
                }
                return insets;
            }
        );
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