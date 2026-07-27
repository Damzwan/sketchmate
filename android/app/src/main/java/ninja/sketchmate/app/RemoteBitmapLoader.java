package ninja.sketchmate.app;

import android.content.Context;
import android.graphics.Bitmap;

import com.bumptech.glide.Glide;
import com.bumptech.glide.RequestManager;
import com.bumptech.glide.load.DecodeFormat;
import com.bumptech.glide.request.FutureTarget;
import com.bumptech.glide.request.RequestOptions;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Bounded, cached remote bitmap loading for non-View Android surfaces.
 *
 * Notifications and RemoteViews need an owned software Bitmap: both callers
 * draw into a software Canvas and may recycle their source after transforming
 * it. Glide owns the decoded resource, so copy it while bounded and then clear
 * the FutureTarget to promptly return Glide's bitmap to its pool.
 */
final class RemoteBitmapLoader {
    private RemoteBitmapLoader() {}

    static Bitmap load(Context context, String url, int maxSize, int timeoutMs) throws IOException {
        if (url == null || url.trim().isEmpty()) return null;
        if (maxSize <= 0) throw new IllegalArgumentException("maxSize must be positive");

        Context appContext = context.getApplicationContext();
        RequestManager requests = Glide.with(appContext);
        RequestOptions options = new RequestOptions()
                .override(maxSize, maxSize)
                .fitCenter()
                .format(DecodeFormat.PREFER_ARGB_8888)
                // Both consumers draw this bitmap into a software Canvas.
                .disallowHardwareConfig()
                .timeout(timeoutMs);

        FutureTarget<Bitmap> target = requests
                .asBitmap()
                .load(url)
                .apply(options)
                .submit(maxSize, maxSize);

        try {
            Bitmap managed = target.get(timeoutMs, TimeUnit.MILLISECONDS);
            Bitmap owned = managed.copy(Bitmap.Config.ARGB_8888, false);
            if (owned == null) throw new IOException("Could not copy decoded bitmap");
            return owned;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Bitmap load interrupted", e);
        } catch (ExecutionException | TimeoutException e) {
            throw new IOException("Bitmap load failed", e);
        } finally {
            requests.clear(target);
        }
    }
}
