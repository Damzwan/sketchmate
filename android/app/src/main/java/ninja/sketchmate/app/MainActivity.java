package ninja.sketchmate.app;

import android.app.NotificationManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
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

    /**
     * Android asks a process to give memory back before it kills it. Nothing in
     * the web layer could hear that ask, so the first signal SketchMate got was
     * the process disappearing — the "app dies after 20 minutes" reports on
     * low-end devices.
     *
     * Forwarded as a window event to match the nativeImeInset convention above;
     * a Capacitor plugin listener would need a whole plugin class to carry one
     * integer. The raw ComponentCallbacks2 constant is passed through unmapped:
     * the JS side (src/service/memoryPressure.ts) owns the policy.
     */
    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        emitTrimMemory(level);
    }

    @Override
    public void onLowMemory() {
        super.onLowMemory();
        // Predates onTrimMemory and still fires on some OEM builds. Reported at
        // RUNNING_CRITICAL, which is what it means.
        emitTrimMemory(15);
    }

    private void emitTrimMemory(int level) {
        if (getBridge() == null) return;
        getBridge().triggerWindowJSEvent(
            "nativeTrimMemory",
            "{ \"detail\": { \"level\": " + level + " } }"
        );
    }

    /**
     * Drop every window-insets callback BEFORE the window view is detached.
     *
     * @capacitor/keyboard installs a WindowInsetsAnimation callback on the decor
     * root and, in its `onEnd`, calls
     * `ViewCompat.getRootWindowInsets(rootView).isVisible(...)` with no null
     * check. Tearing an activity down while the IME animation is live runs
     * ViewRootImpl.dispatchDetachedFromWindow -> cancelExistingAnimations ->
     * dispatchAnimationEnd, i.e. that `onEnd` fires on a view that no longer has
     * a root — `getRootWindowInsets` returns null and the process dies with
     * "Attempt to invoke virtual method 'boolean ...p(int)' on a null object
     * reference". The reported path is a configuration RELAUNCH (rotation), but
     * any destroy during the animation reaches it.
     *
     * onDestroy runs before the window is removed (ActivityThread destroys the
     * activity, then calls removeViewImmediate), so clearing the callbacks here
     * means there is nothing left to dispatch into. Nothing is lost: the
     * activity is going away.
     */
    @Override
    public void onDestroy() {
        detachWindowInsetsCallbacks();
        super.onDestroy();
    }

    private void detachWindowInsetsCallbacks() {
        try {
            Window window = getWindow();
            if (window != null) {
                View root = window.getDecorView().getRootView();
                ViewCompat.setWindowInsetsAnimationCallback(root, null);
                ViewCompat.setOnApplyWindowInsetsListener(root, null);
            }
            View content = findViewById(android.R.id.content);
            if (content != null) {
                ViewCompat.setOnApplyWindowInsetsListener(content, null);
            }
        } catch (Throwable ignored) {
            // Teardown hardening must never itself break teardown.
        }
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
