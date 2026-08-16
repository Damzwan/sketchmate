package ninja.sketchmate.app;

import android.app.ActivityManager;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private int lastImeInsetCssPx = -1;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Handle dismissal if the app was completely closed/killed
        handleNotificationDismissal(getIntent());
        watchImeInset();
        dropWindowBackground();
        scheduleDeviceProfileReport();
    }

    /**
     * `triggerWindowJSEvent` only reaches a listener that is already attached,
     * and on a cold start the web layer has not been parsed yet in onCreate. So
     * the report is emitted more than once: shortly after start-up, and on every
     * resume. The web side dedupes by value, and the value never changes for a
     * given device, so repeats cost nothing.
     */
    private void scheduleDeviceProfileReport() {
        try {
            View content = findViewById(android.R.id.content);
            if (content != null) {
                content.postDelayed(this::reportDeviceProfile, 2500);
            }
        } catch (Throwable ignored) {
            // onResume still covers it.
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        reportDeviceProfile();
    }

    /**
     * The WebView is opaque and covers the whole window, so the window's own
     * background is unnecessary overdraw. Depending on Android/driver
     * optimisations it can add a full-screen fill, so removing it is a cheap
     * reduction in work for the constrained devices being protected here.
     *
     * The theme background still applies while the window is being created: it
     * is only cleared once we have a decor view, so the splash/launch surface is
     * unaffected and there is no white flash.
     */
    private void dropWindowBackground() {
        try {
            Window window = getWindow();
            if (window != null) {
                // `null` removes the drawable. A transparent ColorDrawable still
                // participates in the draw/alpha pipeline and therefore does not
                // reliably remove the work this optimisation is targeting.
                window.setBackgroundDrawable(null);
            }
        } catch (Throwable ignored) {
            // A cosmetic optimisation must never prevent the activity starting.
        }
    }

    /**
     * Tell the web layer what class of device this is.
     *
     * `ActivityManager.isLowRamDevice()` is an authoritative platform signal,
     * while total/advertised RAM catches constrained phones that Android does
     * not formally label low-RAM. `navigator.deviceMemory` is quantised and
     * clamped, so JS alone cannot reliably distinguish those tiers.
     *
     * The draw engine derives its render resolution and tile budget from this
     * (see src/service/deviceProfile.ts). Those are resolved
     * synchronously while the canvas is constructed, so the web side persists
     * what it learns here and applies it from the next launch onwards; this
     * event is deliberately fire-and-forget.
     */
    private void reportDeviceProfile() {
        try {
            if (getBridge() == null) return;
            ActivityManager am = (ActivityManager) getSystemService(ACTIVITY_SERVICE);
            if (am == null) return;
            ActivityManager.MemoryInfo info = new ActivityManager.MemoryInfo();
            am.getMemoryInfo(info);
            // API 34 exposes the retail/advertised RAM size. On older releases
            // totalMem is the best signal available but excludes fixed hardware
            // reservations, so the web-side threshold includes some tolerance.
            long reportedMem = Build.VERSION.SDK_INT >= 34 && info.advertisedMem > 0
                ? info.advertisedMem
                : info.totalMem;
            long totalMemMB = reportedMem / (1024L * 1024L);
            String webViewPackage = "";
            String webViewVersion = "";
            if (Build.VERSION.SDK_INT >= 26) {
                PackageInfo webViewInfo = WebView.getCurrentWebViewPackage();
                if (webViewInfo != null) {
                    webViewPackage = webViewInfo.packageName;
                    webViewVersion = webViewInfo.versionName;
                }
            }
            JSONObject detail = new JSONObject();
            detail.put("lowRam", am.isLowRamDevice());
            detail.put("totalMemMB", totalMemMB);
            detail.put("webViewPackage", webViewPackage);
            detail.put("webViewVersion", webViewVersion);
            JSONObject payload = new JSONObject();
            payload.put("detail", detail);
            getBridge().triggerWindowJSEvent(
                "nativeDeviceProfile",
                payload.toString()
            );
        } catch (Throwable ignored) {
            // The web layer falls back to its CPU/memory heuristics.
        }
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
