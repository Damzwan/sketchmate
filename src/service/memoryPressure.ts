// memoryPressure.ts
//
// App-wide bridge for Android's `ComponentCallbacks2.onTrimMemory` (P3.3).
//
// WHY
//
// The "app dies after 20 minutes" class of report on low-end Android is the
// system reclaiming a process that never gave anything back. Android asks
// first — onTrimMemory fires well before the kill — and nothing in the app was
// listening, so the first signal we got was the process disappearing.
//
// The draw engine already sheds its GPU caches on background/hide
// (`draw/diagnostics/drawMemoryPressure.ts`) and it opportunistically listened
// for a `trimMemory` event that no native code ever emitted. This module is the
// missing half: MainActivity forwards the callback, this fans it out, and the
// draw module subscribes here instead of to a bridge event that never fires.
//
// SHAPE OF THE NATIVE EVENT
//
// MainActivity uses `triggerWindowJSEvent`, matching the `nativeImeInset` event
// it already emits, so this is a plain window event rather than a Capacitor
// plugin listener. A plugin listener would have needed a custom plugin class;
// the payload is one integer.
//
// WHAT SUBSCRIBERS MAY DO
//
// Release CACHES only. Everything here must be re-derivable — a redecoded
// thumbnail, a re-fetched conversation, a re-baked tile. Never live document
// data, never unsaved input. The trade is a moment of softness against losing
// the user's place entirely.

/** Raw `TRIM_MEMORY_*` constants from ComponentCallbacks2. */
export const TRIM_MEMORY_RUNNING_MODERATE = 5;
export const TRIM_MEMORY_RUNNING_LOW = 10;
export const TRIM_MEMORY_RUNNING_CRITICAL = 15;
export const TRIM_MEMORY_UI_HIDDEN = 20;

/**
 * Android's ladder collapsed to what a handler can act on.
 *
 * `uiHidden` (20) is numerically the highest but is the *mildest* signal: it
 * only means the UI went away, not that the system is short of memory. It is
 * kept separate so handlers can shed view-layer caches aggressively without
 * treating it as an emergency.
 */
export type MemoryPressureLevel = "moderate" | "low" | "critical" | "uiHidden";

export const NATIVE_TRIM_MEMORY_EVENT = "nativeTrimMemory";

export function levelFromNative(raw: number): MemoryPressureLevel | null {
	if (raw >= TRIM_MEMORY_UI_HIDDEN) return "uiHidden";
	if (raw >= TRIM_MEMORY_RUNNING_CRITICAL) return "critical";
	if (raw >= TRIM_MEMORY_RUNNING_LOW) return "low";
	if (raw >= TRIM_MEMORY_RUNNING_MODERATE) return "moderate";
	// Below RUNNING_MODERATE there is no defined level to act on. The comparison
	// is `>=` so the deprecated background ladder — BACKGROUND (40), MODERATE
	// (60), COMPLETE (80) — still lands on `uiHidden` rather than being dropped
	// on the OEM builds that continue to send it.
	return null;
}

type Handler = (level: MemoryPressureLevel) => void;

const handlers = new Set<Handler>();
let listener: ((event: Event) => void) | null = null;

/**
 * Subscribe to memory pressure. Returns an unsubscribe function.
 *
 * Handlers must be idempotent and cheap: the system may fire several levels in
 * quick succession, and a handler that allocates while shedding is worse than
 * no handler at all.
 */
export function onMemoryPressure(handler: Handler): () => void {
	handlers.add(handler);
	return () => handlers.delete(handler);
}

/** Fan out to every subscriber. Exported for the native bridge and for tests. */
export function emitMemoryPressure(level: MemoryPressureLevel): void {
	for (const handler of handlers) {
		try {
			handler(level);
		} catch (e) {
			// A handler that throws while the system is reclaiming must not stop
			// the others from giving their memory back.
			console.error("[memoryPressure] handler failed:", e);
		}
	}
}

/** Idempotent. Safe to call on web, where the event simply never arrives. */
export function installMemoryPressureBridge(): void {
	if (listener || typeof window === "undefined") return;

	listener = (event: Event) => {
		const raw = (event as CustomEvent<{ level?: number }>).detail?.level;
		if (typeof raw !== "number") return;

		const level = levelFromNative(raw);
		if (!level) return;

		void reportMemoryPressure(level, raw);
		emitMemoryPressure(level);
	};

	window.addEventListener(NATIVE_TRIM_MEMORY_EVENT, listener);
}

export function uninstallMemoryPressureBridge(): void {
	if (listener && typeof window !== "undefined") {
		window.removeEventListener(NATIVE_TRIM_MEMORY_EVENT, listener);
	}
	listener = null;
}

/**
 * Breadcrumb, not an event: on its own a trim is normal Android behaviour. It
 * only becomes interesting as the trail leading up to a crash report, which is
 * exactly what breadcrumbs are for. Sentry is a lazy chunk, so this is a
 * dynamic import and deliberately unawaited by callers.
 */
async function reportMemoryPressure(
	level: MemoryPressureLevel,
	raw: number,
): Promise<void> {
	try {
		const Sentry = await import("@sentry/capacitor");
		Sentry.addBreadcrumb({
			category: "memory",
			level: level === "moderate" || level === "uiHidden" ? "info" : "warning",
			message: `onTrimMemory ${level}`,
			data: {
				raw,
				route:
					typeof location !== "undefined"
						? location.hash || location.pathname
						: "",
			},
		});
	} catch {
		/* Sentry unavailable — the shed itself is what matters. */
	}
}
