// drawMemoryPressure.ts
//
// Releases the draw engine's GPU-backed caches when the app is backgrounded or
// the platform signals memory pressure.
//
// WHY (docs/DRAW_ENGINE_MAINTHREAD_REVIEW.md → M7)
//
// Nothing in the draw module previously observed `visibilitychange`, the
// Capacitor app-state event, or Android's `onTrimMemory`. A backgrounded
// SketchMate kept the whole tile cache, the overview bitmap, the canvas pool,
// fabric's lower + upper canvases and the transform drag layer resident — every
// one of them a GPU allocation, in a WebView renderer process that has its own
// (small, on a 2 GB device) memory limit.
//
// That is the `libwebviewchromium.so SIGTRAP` cluster: a Chromium `CHECK()`,
// most often renderer OOM. Note it is the RENDERER process, not the app's Java
// heap — `android:largeHeap` would do nothing for it. Resident bytes are the
// only lever, and the bytes that are cheapest to give up are exactly the ones
// nobody is looking at.
//
// The trade is explicit and one-sided: everything released here is a CACHE.
// Coming back costs a normal bake of the visible tiles — a moment of softness,
// with the whole drawing still on screen at overview resolution throughout.
// Not releasing costs a process kill, i.e. the user loses their place entirely.
// This converts a crash into a blur.
//
// What is released is TILES ONLY. The overview bitmap is deliberately retained
// (see RenderEngine.releaseGraphicsMemory): it is ~4 MB against tens of MB of
// tiles, and it is the base layer that keeps the board from going blank. An
// earlier version dropped it too and produced exactly that — a drawing that
// loads, goes white, and only reappears as the user pans new tiles into
// existence.

import { App as CapacitorApp } from "@capacitor/app";
import type { PluginListenerHandle } from "@capacitor/core";
import {
	installMemoryPressureBridge,
	onMemoryPressure,
} from "@/service/memoryPressure";

export interface DrawMemoryPressureHandlers {
	/** Drop every GPU-backed cache. Must be safe to call repeatedly. */
	release: () => void;
	/** Rebuild enough to paint. Must be safe to call without a prior release. */
	restore: () => void;
}

/**
 * How long the app must stay hidden before we release.
 *
 * A short hide is routine — the share sheet, the image picker, a permission
 * dialog, the notification shade — and Android WebView also reports transient
 * hidden/inactive states of its own during heavy main-thread work, which is
 * exactly when a big drawing is loading. Releasing on those and rebuilding a
 * moment later costs far more than it saves: on a 7,000-object board the
 * re-bake is seconds of work the user watches happen.
 *
 * Android's native `TRIM_MEMORY_UI_HIDDEN` signal does not use this delay: it
 * is the platform telling us the UI-backed bitmaps are no longer visible, and
 * field evidence ties retaining a full cache across that transition to an
 * Adreno allocator abort. This grace remains for browser visibility changes
 * and platforms where a transient dialog is the only signal.
 */
export const HIDE_GRACE_MS = 20_000;

let handlers: DrawMemoryPressureHandlers | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;
let released = false;
let onVisibility: (() => void) | null = null;
let appStateListener: PluginListenerHandle | null = null;
let unsubscribeMemoryPressure: (() => void) | null = null;

type GraphicsReleaseReason =
	| "hidden-grace"
	| "memory-uiHidden"
	| "memory-low"
	| "memory-critical";

function cancelHideTimer(): void {
	if (hideTimer === null) return;
	clearTimeout(hideTimer);
	hideTimer = null;
}

function reportGraphicsLifecycle(
	action: "released" | "restored",
	reason?: GraphicsReleaseReason,
): void {
	void import("@sentry/capacitor")
		.then((Sentry) =>
			Sentry.addBreadcrumb({
				category: "draw.graphics",
				level: "info",
				message: `Draw graphics ${action}`,
				data: reason ? { reason } : undefined,
			}),
		)
		.catch(() => {
			/* diagnostics must never interfere with releasing graphics memory */
		});
}

function releaseNow(reason: GraphicsReleaseReason): void {
	cancelHideTimer();
	if (released || !handlers) return;
	released = true;
	try {
		handlers.release();
		reportGraphicsLifecycle("released", reason);
	} catch {
		// A failed release must never be able to break the canvas on return.
	}
}

function scheduleRelease(): void {
	if (released || hideTimer !== null) return;
	hideTimer = setTimeout(() => releaseNow("hidden-grace"), HIDE_GRACE_MS);
}

function restoreNow(): void {
	cancelHideTimer();
	if (!released || !handlers) return;
	released = false;
	try {
		handlers.restore();
		reportGraphicsLifecycle("restored");
	} catch {
		/* ignore — the next edit or gesture will request a frame anyway */
	}
}

function bindNativeListeners(): void {
	// `App.addListener` resolves asynchronously. Guard every assignment against
	// the module having been uninstalled while it was pending, or a listener
	// outlives the canvas that created it.
	void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
		if (isActive) restoreNow();
		else scheduleRelease();
	})
		.then((handle) => {
			if (handlers) appStateListener = handle;
			else void handle.remove();
		})
		.catch(() => {
			/* web / unsupported platform — visibilitychange covers it */
		});

	// Android `onTrimMemory`, forwarded by MainActivity through
	// `service/memoryPressure.ts`. `moderate` is the system asking politely
	// while it still has room; from `low` upwards it is already choosing a
	// process to kill, so release immediately rather than waiting out the grace
	// period. `uiHidden` is exactly the point at which Android recommends
	// releasing UI-only bitmap resources. Do it immediately: preserving a warm
	// tile cache across WebView/Adreno surface transitions is less important than
	// avoiding a native graphics allocator failure.
	installMemoryPressureBridge();
	unsubscribeMemoryPressure = onMemoryPressure((level) => {
		if (level === "uiHidden" || level === "low" || level === "critical") {
			releaseNow(`memory-${level}`);
		}
	});
}

/** Called once per canvas, from the object manager's `init`. */
export function installDrawMemoryPressure(
	next: DrawMemoryPressureHandlers,
): void {
	uninstallDrawMemoryPressure();
	handlers = next;
	released = false;

	if (typeof document !== "undefined") {
		onVisibility = () => {
			if (document.visibilityState === "hidden") scheduleRelease();
			else restoreNow();
		};
		document.addEventListener("visibilitychange", onVisibility);
	}
	bindNativeListeners();
}

/** Canvas teardown. Leaves whatever was released released — the engine is
 *  going away regardless, and `detach()` frees the rest. */
export function uninstallDrawMemoryPressure(): void {
	cancelHideTimer();
	handlers = null;
	released = false;
	if (onVisibility && typeof document !== "undefined") {
		document.removeEventListener("visibilitychange", onVisibility);
	}
	onVisibility = null;
	void appStateListener?.remove();
	appStateListener = null;
	unsubscribeMemoryPressure?.();
	unsubscribeMemoryPressure = null;
}

/** Test seam: is the engine currently in the released state? */
export function isDrawGraphicsReleased(): boolean {
	return released;
}
