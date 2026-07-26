// tileBakery.service.ts
//
// Main-thread client for tileBakery.worker. Answers "is fabric-in-a-worker
// worth the serialization?" with the only economics that work: a PERSISTENT
// mirror fed by per-object deltas, never whole-scene snapshots.
//
//   • markDirty(obj) is O(1) — it parks a ref. Serialization (toJSON) happens
//     once per object per flush, at settle points, right before the bake that
//     needs it. Streamed remote drags therefore coalesce to one toJSON.
//   • bake() ships tile geometry + z-sorted ids; the worker renders from its
//     mirror and replies with a transferable ImageBitmap — no pixel copy.
//   • postMessage FIFO + the worker's chained handler guarantee any upsert
//     posted before a bake is applied before that bake renders.
//   • Correctness never depends on the mirror being fresh: the committed
//     layer's generation check discards stale bitmaps, and { missing } replies
//     trigger one re-upsert + retry, then fall back to the main-thread baker.
//
// Refused tiles (return null → main-thread bake):
//   • text — the worker has no @font-face registry; wrong glyph metrics in a
//     committed tile would be a visible correctness bug, not a perf trade.
//   • objects inside a group / ActiveSelection — their serialized transform is
//     group-relative; the mirror would render them at the wrong place.
//   • transiently hidden objects (opacity 0 / visible false — mid-drag hide by
//     the transform controller) — the mirror still has them visible, so a
//     worker bake would ghost them back in; the local baker reads live state.
//
// Refusals are counted (drawMetrics) — the refusal RATE is what decides whether
// worker-side fonts / image transferables are worth building. See
// docs/DRAW_ENGINE_PERF.md finding F3.

import { FabricImage } from "fabric";
import type { FabricObject } from "fabric";
import type { RemoteBakeResult, WorldRect } from "@/draw/committedLayer";
import type { BakeryResponse } from "@/draw/types/tileBakery.types";
import {
	recordBakeHardError,
	recordBakeMissingRetry,
	recordBakeryDisabled,
	recordBakeryPause,
	recordBakeTimeout,
	recordFlush,
	recordPhase,
	recordTileFailed,
	recordTileHybrid,
	recordBakeTiming,
	recordTileRefused,
	recordTileRemote,
	type RefusalReason,
} from "@/draw/services/drawMetrics.service";

// ─── health model ────────────────────────────────────────────────────────────
//
// A TIMEOUT IS NOT A FAULT. It is back-pressure: the worker may simply be slow
// (cold module parse, a dense first bake, a device under memory pressure).
//
// The previous model counted every timeout toward a 3-strike budget that only
// reset on success. CommittedLayer.bake runs FOUR concurrent lanes, so a single
// slow first pass produced four timeouts before any success could land — and
// the bakery shut itself down PERMANENTLY for the session. After that every
// tile baked on the main thread, and dropRegionLight went from 0 sync tiles
// back to 8 per drag commit: strictly worse than the pre-worker build, with no
// signal beyond a console.warn. That is finding F2, and it is the leading
// suspect for the ANR cohort.
//
// New model:
//   • timeout      → abandon THAT request, count it, keep going. Only a long
//                    unbroken run of them (no reply of any kind in between)
//                    pauses the bakery.
//   • hard error   → a real fault (worker.onerror, or an { error } reply).
//                    Bounded budget, decays on every healthy reply.
//   • pause        → terminate + cooldown, then RE-ARM. Never permanent.
//   • disable      → only for an unsupported environment, or after so many
//                    pauses that the worker is clearly unusable here.

/** Generous while the worker is still cold: module parse + first enliven. */
const COLD_TIMEOUT_MS = 20_000;
/** Steady state, once the worker has replied at least once. */
const WARM_TIMEOUT_MS = 8_000;
/** Structured errors tolerated before a pause. Decays on healthy replies. */
const MAX_HARD_FAILURES = 5;
/** Consecutive timeouts with NO reply in between before a pause. Must exceed
 *  the bake lane count (4) so one stalled pass cannot trip it. */
const MAX_CONSECUTIVE_TIMEOUTS = 8;
/** Cooldown before a paused bakery re-arms with a fresh worker. */
const PAUSE_MS = 30_000;
/** Pauses tolerated before giving up on this device for the session. */
const MAX_PAUSES = 4;
/** Safety valve so a stalled worker cannot be queue-flooded. Bake uses 4 lanes
 *  plus at most one overview, so this is never hit in normal operation. */
const MAX_IN_FLIGHT = 8;

interface PendingBake {
	resolve: (r: BakeryResponse | null) => void;
	timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
/** Permanent for this session. Unsupported env, or too many pauses. */
let disabled = false;
/** Wall-clock ms; > 0 means paused. Re-arms once `Date.now()` passes it. */
let pausedUntil = 0;
let pauses = 0;
let hardFailures = 0;
let consecutiveTimeouts = 0;
/** The worker has replied at least once since the last (re)spawn. */
let sawReply = false;
let msgSeq = 0;
/**
 * Cancellation generation. Bumped by `bakeryCancel()` (gesture start) and
 * stamped onto every bake / overview request, so the worker can drop work that
 * belongs to an abandoned pass instead of rasterizing pixels nobody will use.
 */
let epoch = 0;
let liveMaxConfig = 8192;
/**
 * Font families the worker has registered in its own FontFaceSet.
 *
 * Empty until the worker reports back (and permanently empty where
 * WorkerGlobalScope.fonts is unsupported), so text tiles are refused by
 * default — a face the worker lacks would bake FALLBACK GLYPHS into a
 * committed tile, which is a correctness bug, not a perf trade. Cleared on
 * teardown because a re-armed worker must re-register before we trust it.
 */
let workerFonts = new Set<string>();

const pending = new Map<number, PendingBake>();
/** id → live object ref; serialized lazily on flush. */
const dirty = new Map<string, FabricObject>();

function isPaused(): boolean {
	if (!pausedUntil) return false;
	if (Date.now() < pausedUntil) return true;
	rearm();
	return false;
}

function rearm(): void {
	pausedUntil = 0;
	hardFailures = 0;
	consecutiveTimeouts = 0;
	sawReply = false; // fresh worker → cold timeouts apply again
	// The terminated worker took its mirror with it. Nothing is re-seeded
	// eagerly: objects marked dirty DURING the pause are still parked here and
	// go out on the next idle flush, and any id the fresh worker does not have
	// comes back `{ missing }` and is re-upserted by the existing self-heal.
}

function noteReply(): void {
	sawReply = true;
	consecutiveTimeouts = 0;
	// Decay rather than reset: an alternating error/success pattern must still
	// accumulate toward a pause instead of being cleared every other message.
	if (hardFailures > 0) hardFailures--;
}

function noteTimeout(): void {
	recordBakeTimeout();
	consecutiveTimeouts++;
	if (consecutiveTimeouts >= MAX_CONSECUTIVE_TIMEOUTS) pause("timeout");
}

function noteHardError(): void {
	recordBakeHardError();
	hardFailures++;
	if (hardFailures >= MAX_HARD_FAILURES) pause("error");
}

function pause(reason: "timeout" | "error"): void {
	if (disabled || pausedUntil) return;
	pauses++;
	recordBakeryPause(reason);
	teardown();
	if (pauses > MAX_PAUSES) {
		disable(`repeated ${reason} pauses`);
		return;
	}
	pausedUntil = Date.now() + PAUSE_MS;
	console.warn(
		`[TileBakery] paused for ${PAUSE_MS}ms after ${reason}; tiles bake on the main thread until it re-arms`,
	);
}

function disable(reason: string): void {
	disabled = true;
	recordBakeryDisabled();
	teardown();
	// NB: dirty is only cleared here, on the permanent path. A PAUSE keeps the
	// parked refs so the re-armed worker gets seeded from them.
	dirty.clear();
	console.warn(
		`[TileBakery] disabled for this session (${reason}) — all tile baking falls back to the main thread`,
	);
}

/** Kill the worker and settle everything waiting on it. */
function teardown(): void {
	if (worker) {
		worker.terminate();
		worker = null;
	}
	// A fresh worker has an empty FontFaceSet until it re-registers.
	workerFonts.clear();
	for (const [, p] of pending) {
		clearTimeout(p.timer);
		p.resolve(null);
	}
	pending.clear();
}

function getWorker(): Worker | null {
	if (disabled) return null;
	if (isPaused()) return null;
	if (worker) return worker;
	if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
		disable("no Worker / OffscreenCanvas");
		return null;
	}
	try {
		worker = new Worker(
			new URL("../workers/tileBakery.worker.ts", import.meta.url),
			{ type: "module" },
		);
	} catch {
		disable("worker construction threw");
		return null;
	}
	worker.onerror = () => noteHardError();
	worker.onmessage = (e: MessageEvent<BakeryResponse>) => {
		// Unsolicited notification: which font families the worker registered.
		// Until this lands, `workerFonts` is empty and every text tile is refused
		// — the safe default.
		if (e.data.fonts !== undefined) {
			workerFonts = new Set(e.data.fonts);
			noteReply();
			return;
		}
		const p = pending.get(e.data.msgId);
		if (!p) {
			// Late reply after we abandoned the request — free the bitmap, it will
			// never be used. Still counts as proof of life.
			e.data.bitmap?.close();
			noteReply();
			return;
		}
		pending.delete(e.data.msgId);
		clearTimeout(p.timer);
		// Any reply — including `{ missing }` and `{ aborted }` — means the worker
		// is alive. An `aborted` reply is our OWN cancel coming back, so it is
		// proof of life and must never touch the hard-failure budget.
		if (e.data.error) noteHardError();
		else noteReply();
		p.resolve(e.data);
	};
	// Re-send config on every spawn: after a re-arm the fresh worker would
	// otherwise sit at its default LIVE_MAX and thrash its enliven cache.
	worker.postMessage({ t: "config", liveMax: liveMaxConfig });
	return worker;
}

/** Warm the worker during canvas init so the first bake doesn't pay spawn+parse. */
export function initTileBakery(): void {
	// Bound the worker's enliven LRU by device class. This must exceed the
	// WHOLE VIEWPORT's working set, not just one tile: a bake pass walks ~dozens
	// of tiles back-to-back, so a cap smaller than their combined object count
	// makes each tile evict the previous tile's objects and re-enliven them —
	// thrash that stalls bakes and leaves the view blurry on dense boards.
	// These are JSON-backed and re-enliven on demand, so over-provisioning only
	// costs worker RAM, which is still bounded (and far cheaper than a stall).
	const mobile =
		typeof navigator !== "undefined" &&
		/Mobi|Android/i.test(navigator.userAgent);
	const hw = (navigator as any)?.hardwareConcurrency || 4;
	const lowEnd = mobile && hw <= 4;
	liveMaxConfig = lowEnd ? 2048 : 8192;
	getWorker(); // spawn now; the config message goes out with it
}

export function isBakeryActive(): boolean {
	return !disabled && !isPaused() && worker !== null;
}

/**
 * ABANDON every bake / overview currently issued. Call at gesture start.
 *
 * `RenderCore.abortBakes()` only aborts the MAIN-THREAD loop: requests already
 * posted kept enlivening and rasterizing in the worker, and their bitmaps were
 * closed on arrival. That is pure waste at the worst moment — the worker's
 * canvas is GPU-backed, so on mobile its raster contends with the compositor
 * frames driving the gesture. This tells the worker to drop them (it compares
 * each request's epoch against the newest cancel, out of band so the message is
 * not stuck behind the bake it cancels).
 *
 * Pending promises settle `null` locally rather than waiting for the worker's
 * `aborted` replies, so the caller is not held up. Deliberately NOT counted as
 * timeouts — a cancel is our decision, not worker ill-health, and charging it
 * would march `consecutiveTimeouts` toward a 30s bakery pause every time the
 * user pans.
 *
 * CALL ORDER MATTERS: the caller's AbortSignal must already be aborted, because
 * a `null` here means "worker declined" to `rebuildTile`, which would otherwise
 * fall through to a synchronous MAIN-THREAD bake — the exact opposite of what a
 * cancel is for. `RenderCore.setGesturing(true)` aborts first, then calls this.
 */
export function bakeryCancel(): void {
	if (disabled) return;
	epoch++;
	for (const [, p] of pending) {
		clearTimeout(p.timer);
		p.resolve(null);
	}
	pending.clear();
	// No getWorker() here: it would re-arm a paused bakery just to tell it to
	// cancel work it never received.
	worker?.postMessage({ t: "cancel", epoch });
}

export function bakeryMarkDirty(obj: FabricObject): void {
	if (disabled || !obj?.id) return;
	// The cached serialization is now stale — force a fresh toJSON at next flush.
	(obj as any).__bakeJSON = undefined;
	dirty.set(obj.id, obj);
	// Drain in the background. The bake path no longer flushes the global dirty
	// set (see bakeryBakeTile), so this idle drain is what keeps the mirror warm
	// and stops bakes from paying a `missing` round-trip.
	scheduleIdleFlush();
}

/**
 * CLIP-granular mirror sync for an ERASE (commit / undo / redo).
 *
 * An erase mutates only the object's clipPath, never its path or transform, so
 * marking the whole object dirty forced the bake path to re-serialize the ENTIRE
 * object (its own — often large — path + all props + the clip) for every touched
 * object. Doing that for a big erase, then panning, was the block.
 *
 * Instead ship just `clipPath.toObject()` — exactly the sub-tree a full toJSON
 * would put under `clipPath`, so the worker mirror ends up identical — and CLEAR
 * the dirty flag so the bake path re-serializes nothing. The clip serialization
 * itself runs in the (yielded) erase loops, not on the bake/pan frame.
 *
 * `obj.clipPath === undefined` (undo removed the last erase) sends `clip: null`,
 * which clears it in the mirror.
 *
 * NB: a FLATTENED clip (`__hasImageClip`) must NOT come here — its clip holds a
 * base64 image whose toObject would be a huge postMessage, and such objects are
 * refused by the worker anyway. Callers guard on that and fall back to
 * bakeryMarkDirty (flushObjects then drops it as unshippable).
 */
export function bakeryClipSet(obj: FabricObject): void {
	if (disabled || !obj?.id) return;
	let clip: any = null;
	const cp = (obj as any).clipPath;
	if (cp) {
		try {
			clip = cp.toObject();
		} catch {
			// Un-serializable clip → fall back to a full re-serialize path.
			bakeryMarkDirty(obj);
			return;
		}
	}
	// The clip delta supersedes any pending full re-serialize for this object.
	dirty.delete(obj.id);
	(obj as any).__bakeJSON = undefined;
	getWorker()?.postMessage({ t: "clipSet", id: obj.id, clip });
}

/**
 * Seed the mirror straight from the JSON the object was enlivened FROM — no
 * toJSON. Used at load, where re-serializing N objects we just deserialized was
 * the main-thread spike (and crash) on big canvases. Stashes the blob on the
 * object so flush ships it as-is until the object actually mutates.
 */
export function bakerySeed(obj: FabricObject, srcJSON: any): void {
	if (disabled || !obj?.id || !srcJSON) return;
	(obj as any).__bakeJSON = srcJSON;
	dirty.set(obj.id, obj);
}

/**
 * Pure-translation drag commit: shift the mirror's coords by (dx,dy) instead of
 * re-serializing every selected object. Turns a 500-object drop from 500
 * synchronous toJSON calls into one tiny message. The main thread has already
 * moved the live objects, so their stale __bakeJSON is dropped — a later full
 * flush (if any) re-serializes with correct coords.
 */
export function bakeryTranslate(ids: string[], dx: number, dy: number): void {
	if (disabled || ids.length === 0) return;
	if (dx === 0 && dy === 0) return;
	// An object with a PENDING full upsert must stay dirty. The delta would be
	// applied to whatever stale version the mirror still holds (v_old + delta
	// instead of v_current + delta) — and because the id IS present, the worker
	// never reports it `missing`, so nothing ever corrects it. That was a
	// permanently warped tile after a few moves. Keeping it dirty costs one
	// toJSON at the next flush, which then overwrites the mirror with the
	// authoritative state (main has already applied the move); postMessage is
	// FIFO, so translate-then-upsert converges correctly.
	// Objects already in sync are NOT dirty and keep the cheap delta path.
	for (const id of ids) {
		const o = dirty.get(id);
		if (o) (o as any).__bakeJSON = undefined; // coords moved — re-serialize
	}
	getWorker()?.postMessage({ t: "translate", ids, dx, dy });
}

export function bakeryRemove(id: string): void {
	if (disabled || !id) return;
	dirty.delete(id);
	forgetAsset(id); // worker closes the bitmap; we release the budget
	getWorker()?.postMessage({ t: "remove", ids: [id] });
}

export function bakeryClear(): void {
	if (disabled) return;
	dirty.clear();
	sentAssets.clear();
	pendingAssets.clear();
	assetBytes = 0;
	getWorker()?.postMessage({ t: "clear" });
}

function serialize(obj: FabricObject): any | null {
	try {
		return (obj as any).toJSON();
	} catch {
		return null;
	}
}

/**
 * The worker mirror is deliberately LEAN: it only ever needs objects it can
 * bake. Text and images are always refused per-tile (see bakeryBakeTile), so
 * their JSON is dead weight in the mirror — skip it. Grouped objects serialize
 * group-relative, so their coords would be wrong; keep them dirty until they
 * leave the group.
 */
/**
 * True when the worker has a registered face for this text object's family, so
 * it will render with the SAME metrics the main thread would. Anything else —
 * no worker font support, a face that failed to load, a family we never ship —
 * stays refused.
 */
function textRenderable(obj: any): boolean {
	if (workerFonts.size === 0) return false;
	const family = obj.fontFamily;
	if (typeof family !== "string" || family.length === 0) return false;
	// fontFamily can be a CSS stack ("Anton, sans-serif"); every named face has
	// to be one we loaded, or a fallback could win for some glyph.
	return family
		.split(",")
		.every((f) => workerFonts.has(f.trim().replace(/^["']|["']$/g, "")));
}

/** A stroke class can opt out of worker baking (static `bakesOnMainThread`) when
 *  its render depends on something the worker can't reconstruct — e.g. a
 *  stampCanvas rebuilt from a dataURL via image decoding (PixelStroke). Such an
 *  object baked BLANK in the worker and vanished at worker tiers / after a move.
 *  Sending the pixels as an ASSET lifts the restriction (see assetSourceOf). */
function bakesOnMain(obj: any): boolean {
	return (obj?.constructor as any)?.bakesOnMainThread === true;
}

// ─── bitmap assets ───────────────────────────────────────────────────────────
//
// Bitmap-backed strokes (Pixel's tip stamp; Neon/Spray/Crayon's rasterized
// artwork) can't be rebuilt in the worker — Pixel needs image decoding, and the
// others would have to re-run an expensive generator on every enliven. So we
// ship the PIXELS once, as a transferable ImageBitmap, and the worker renders
// them like anything else. Until an object's asset has landed it stays refused
// and bakes on the main thread, i.e. exactly the previous behaviour — this can
// only add capability, never regress it.
//
// Budget: bitmaps are the memory here, so cap the total shipped. Past the cap
// nothing more is sent and the remaining objects keep baking locally. We never
// re-send or evict: worker-side eviction would silently strand an object.
const ASSET_BUDGET_BYTES = (() => {
	const mobile =
		typeof navigator !== "undefined" &&
		/Mobi|Android/i.test(navigator.userAgent);
	return mobile ? 24 * 1024 * 1024 : 64 * 1024 * 1024;
})();

/** ids whose pixels the worker already holds. */
const sentAssets = new Set<string>();
/** ids with a createImageBitmap in flight, so we don't start a second one. */
const pendingAssets = new Set<string>();
let assetBytes = 0;

/**
 * The source pixels for a bitmap-backed stroke, or null if it isn't one.
 * FabricImage subclasses (Neon/Spray/Crayon) expose their element; PixelStroke
 * keeps a small `stampCanvas`.
 */
function assetSourceOf(obj: any): CanvasImageSource | null {
	if (obj?.stampCanvas) return obj.stampCanvas as CanvasImageSource;
	const el = obj?.getElement?.();
	return el ?? null;
}

function isBitmapBacked(obj: any): boolean {
	return bakesOnMain(obj) || obj instanceof FabricImage;
}

/**
 * Ship this object's pixels to the worker if we haven't already. Async and
 * fire-and-forget: `createImageBitmap` is off the critical path, so the current
 * bake still takes the local route and the NEXT one gets the worker.
 */
function ensureAsset(obj: any): void {
	const id = obj?.id;
	if (!id || sentAssets.has(id) || pendingAssets.has(id)) return;
	if (assetBytes >= ASSET_BUDGET_BYTES) return;
	if (typeof createImageBitmap === "undefined") return;
	const src = assetSourceOf(obj);
	if (!src) return;
	const w = (src as any).width | 0;
	const h = (src as any).height | 0;
	if (w <= 0 || h <= 0) return;
	const bytes = w * h * 4;
	if (assetBytes + bytes > ASSET_BUDGET_BYTES) return;

	pendingAssets.add(id);
	createImageBitmap(src).then(
		(bitmap) => {
			pendingAssets.delete(id);
			const w2 = getWorker();
			if (!w2) {
				bitmap.close();
				return;
			}
			try {
				w2.postMessage({ t: "asset", id, bitmap }, [bitmap]);
				sentAssets.add(id);
				assetBytes += bytes;
			} catch {
				bitmap.close();
			}
		},
		() => {
			pendingAssets.delete(id);
		},
	);
}

function forgetAsset(id: string): void {
	// The worker frees the bitmap on its side; we only release the budget.
	sentAssets.delete(id);
	pendingAssets.delete(id);
}

/**
 * Does this object's clip contain a rasterized mask (a flattened erase)?
 *
 * `bakeClipGroupIfNeeded` collapses old eraser strokes into a `fabric.Image`
 * inside the ClippingGroup and sets `__hasImageClip`. But that flag is a RUNTIME
 * marker — it is not serialized. So after a save + reload the flag is gone while
 * the image is still in the clip, the refusal guards passed, and the object was
 * shipped to a worker that CANNOT decode an image: the enliven hung forever and
 * took the whole message pump with it.
 *
 * So inspect the live clip instead of trusting the flag, and memoize the answer
 * back onto the flag (a clip only gains an image via flatten; the un-flatten path
 * clears it explicitly).
 */
function hasImageClip(obj: any): boolean {
	if (obj.__hasImageClip) return true;
	const kids = obj.clipPath?._objects;
	if (!Array.isArray(kids)) return false;
	for (let i = 0; i < kids.length; i++) {
		const k = kids[i];
		if (k && (k.type === "image" || k instanceof FabricImage)) {
			obj.__hasImageClip = true;
			return true;
		}
	}
	return false;
}

function shippable(obj: any): boolean {
	if (obj.group) return false;
	if (obj.text !== undefined) return textRenderable(obj);
	if (hasImageClip(obj)) return false;
	// A real user image: never shipped. Checked BEFORE the bitmap-asset path —
	// a real image is also `instanceof FabricImage`, but its pixels are a photo
	// (budget) and may be cross-origin, so it keeps baking locally.
	if (obj.type === "image") return false;
	// Bitmap-backed strokes — Pixel (stamp rebuilt via image decoding) and the
	// FabricImage subclasses Neon/Spray/Crayon, which serialize under their own
	// type so a bare `type === 'image'` check missed them. The worker can render
	// these ONLY once it holds their pixels; until then they're refused and bake
	// locally. Kick off the (async) transfer so the next bake can use the worker.
	if (isBitmapBacked(obj)) {
		if (sentAssets.has(obj.id)) return true;
		ensureAsset(obj);
		return false;
	}
	return true;
}

/**
 * Max objects shipped in one synchronous flush.
 *
 * postMessage deep-clones its payload on the CALLING thread, so posting the
 * whole scene in one message was a single blocking clone of every object's JSON
 * (tens of MB on a big board). That is the "load a big canvas, zoom immediately,
 * spike" — the first bake's flush dumped everything at once. Bounded here and
 * drained on idle; a bake that needs a not-yet-sent id gets `missing` back and
 * the existing self-heal re-upserts just that tile's objects.
 */
const MAX_FLUSH_ITEMS = 192;
/** Wall-clock ceiling for ONE flush batch when the idle callback gives us no
 *  deadline (the setTimeout fallback path). */
const FLUSH_BUDGET_MS = 6;
/** Normal `requestIdleCallback` deadline for the background drain. */
const IDLE_FLUSH_TIMEOUT_MS = 500;
/** Deadline used when resuming after a gesture — must beat RenderCore's
 *  `bakeDebounce` (80ms), or the bake path inherits the un-shipped items. */
const URGENT_FLUSH_TIMEOUT_MS = 40;
/** Retry cadence for the idle drain while the bakery is paused. */
const PAUSED_RETRY_MS = 2_000;
let idleFlushHandle: ReturnType<typeof setTimeout> | null = null;
/**
 * Suspends the idle drain for the duration of a gesture (see bakeryPauseFlush).
 */
let flushPaused = false;

/**
 * Stop / resume the idle drain around a gesture.
 *
 * `requestIdleCallback` fires in the gaps between frames — and during a gesture
 * those gaps are LARGE, because the bake pass has just been aborted. So the
 * drain went off on almost every gesture frame, and each run was a synchronous
 * block: up to MAX_FLUSH_ITEMS `toJSON()` plus one structured clone of the whole
 * batch inside `postMessage`. `touchmove` is a non-passive listener
 * (gestureDetector), so that block lands directly on input latency.
 *
 * Nothing is lost by waiting: the dirty set is still parked, and the resume call
 * re-arms the drain. A bake that needs an id we haven't shipped yet gets
 * `missing` back and the existing self-heal re-upserts it.
 */
export function bakeryPauseFlush(on: boolean): void {
	flushPaused = on;
	// Resume URGENTLY. The bake pass restarts `bakeDebounce` (80ms) after the
	// gesture ends, and whatever the drain has not shipped by then is paid for on
	// the BAKE path instead — `flushObjects` per tile, i.e. a structured clone
	// inside each tile's un-yieldable prologue. A plain idle callback can be
	// hundreds of ms out (its own timeout is 500), so it routinely lost that race
	// and the pause simply moved the cost rather than removing it. Each batch is
	// still time-boxed, so an urgent drain is not a long block.
	if (!on) scheduleIdleFlush(URGENT_FLUSH_TIMEOUT_MS);
}

function scheduleIdleFlush(timeoutMs = IDLE_FLUSH_TIMEOUT_MS): void {
	if (idleFlushHandle !== null || dirty.size === 0 || disabled) return;
	if (flushPaused) return; // re-armed by bakeryPauseFlush(false)
	const run = (deadline?: { timeRemaining(): number }) => {
		idleFlushHandle = null;
		if (disabled || flushPaused) return;
		const w = getWorker();
		if (!w) {
			// Paused. Keep the parked refs and try again after the cooldown rather
			// than dropping the drain — the re-armed worker starts with an empty
			// mirror and these are exactly what it needs.
			if (dirty.size > 0) {
				idleFlushHandle = setTimeout(run, PAUSED_RETRY_MS);
			}
			return;
		}
		flush(w, deadline);
		if (dirty.size > 0) scheduleIdleFlush();
	};
	const ric = (globalThis as any).requestIdleCallback;
	idleFlushHandle = ric
		? (ric(run, { timeout: timeoutMs }) as any)
		: setTimeout(run, 0);
}

/** Seed the mirror ahead of the first bake, in idle-sized chunks. */
export function bakeryFlushSoon(): void {
	if (disabled) return;
	scheduleIdleFlush();
}

/**
 * Drain up to MAX_FLUSH_ITEMS of the global dirty set.
 *
 * IDLE ONLY. This must never be called from the bake path — see bakeryBakeTile.
 */
function flush(w: Worker, deadline?: { timeRemaining(): number }): void {
	if (dirty.size === 0) return;
	const t0 = performance.now();
	const items: { id: string; json: any }[] = [];
	for (const [id, obj] of dirty) {
		if (items.length >= MAX_FLUSH_ITEMS) break;
		// TIME, not just count. `toJSON()` cost per object spans ~two orders of
		// magnitude — a 3-point line vs a 4000-point watercolor path — so a flat
		// item cap is not a time cap, and a batch of dense strokes blew the frame
		// even though it was "only" 192 items. Stop on the real budget and let the
		// next idle callback take the rest; the loop re-arms itself below.
		if (
			items.length > 0 &&
			(deadline
				? deadline.timeRemaining() <= 1
				: performance.now() - t0 >= FLUSH_BUDGET_MS)
		)
			break;
		const a = obj as any;
		if (a.group) continue; // may ungroup later → keep dirty, don't drop
		if (!shippable(a)) {
			dirty.delete(id);
			continue;
		}
		// Prefer the stashed source JSON (load / unchanged) over a fresh toJSON —
		// that recursive serialization is the main-thread cost we are avoiding.
		const json = a.__bakeJSON ?? serialize(obj);
		if (json) items.push({ id, json });
		// Reclaim: the worker now owns this blob. Retaining it on the main-thread
		// object would keep N parsed JSON graphs alive next to the live objects —
		// pure memory waste at 10k. Re-serialize on the rare later flush instead.
		a.__bakeJSON = undefined;
		dirty.delete(id);
	}
	if (items.length) postUpsert(w, items);
	const ms = performance.now() - t0;
	recordFlush(ms, items.length);
	recordPhase("flushIdle", ms);
	if (dirty.size > 0) scheduleIdleFlush(); // rest goes out between frames
}

/**
 * Force-sync the mirror for exactly these objects before a render that needs
 * them. MANDATORY: the idle drain is capped (MAX_FLUSH_ITEMS) and spread across
 * idle callbacks, so a render could otherwise proceed while the mirror still
 * held an OLD version of a dirty object. The worker HAS that id, just stale, so
 * it never reports `missing` and the self-heal never fires — the stale pixels
 * come back, `gen` has not moved, and they get stored as FRESH. That is a
 * permanent wrong tile at the current tier (it only looked fixed after zooming,
 * because a different tier baked from scratch).
 *
 * Cost is bounded by how many of THESE objects are dirty, not by the scene —
 * which is the whole point of calling this instead of flush() on the bake path.
 */
function flushObjects(w: Worker, objects: FabricObject[]): void {
	if (dirty.size === 0) return;
	const t0 = performance.now();
	const items: { id: string; json: any }[] = [];
	for (const obj of objects) {
		const id = obj.id;
		if (!id || !dirty.has(id)) continue;
		const a = obj as any;
		if (a.group) continue; // still group-relative — cannot ship yet
		if (!shippable(a)) {
			dirty.delete(id);
			continue;
		}
		const json = a.__bakeJSON ?? serialize(obj);
		if (json) items.push({ id, json });
		a.__bakeJSON = undefined;
		dirty.delete(id);
	}
	if (items.length) postUpsert(w, items);
	const ms = performance.now() - t0;
	recordFlush(ms, items.length);
	// Separate bucket from the idle drain: this one runs INSIDE a tile's bake
	// prologue, i.e. on the frames the user is panning. flushIdle does not.
	recordPhase("flushBake", ms);
}

/**
 * postMessage the upsert batch, surviving un-cloneable payloads.
 *
 * Some serialized objects carry a FUNCTION-valued property, which makes
 * structured clone throw DataCloneError. That used to escape out of `flush()`
 * — and because `flush` was called from `bakeryBakeTile`, the throw was caught
 * by rebuildTile's `try` around the remote baker and silently turned into a
 * local main-thread bake. So a single bad object could quietly disable
 * worker baking for the whole board: exactly the kind of silent degradation
 * that looks like "the worker isn't helping".
 *
 * Fast path stays allocation-free. Only on failure do we pay a JSON round-trip,
 * which drops function props (they are not renderable data anyway).
 */
function postUpsert(w: Worker, items: { id: string; json: any }[]): void {
	try {
		w.postMessage({ t: "upsert", items });
		return;
	} catch {
		/* falls through to the sanitized retry */
	}
	try {
		w.postMessage({ t: "upsert", items: JSON.parse(JSON.stringify(items)) });
		console.warn(
			"[TileBakery] upsert payload was not structured-cloneable; sent a JSON-sanitized copy",
		);
	} catch (err) {
		// Undeliverable batch: drop it rather than kill the flush loop. The tiles
		// that need these ids get `missing` back and fall back to a local bake.
		console.warn("[TileBakery] dropped an un-serializable upsert batch", err);
	}
}

/**
 * Post a request and track its reply. Timeouts abandon the request without
 * blaming the worker for it (see the health model at the top of this file).
 */
/** Extra budget per object in a request. A tile holding 1200 strokes has to
 *  enliven and render 1200 strokes — it is legitimately slower than one holding
 *  five, and a flat budget declared it "stuck". Generous: this only decides when
 *  we give up, never how long we wait for a healthy reply. */
const PER_OBJECT_TIMEOUT_MS = 6;

function track(
	w: Worker,
	msg: Record<string, unknown>,
	/** Objects this request must enliven + render — its real cost driver. */
	weight = 0,
): Promise<BakeryResponse | null> {
	// Back-pressure: never pile more onto a worker that is already behind.
	if (pending.size >= MAX_IN_FLIGHT) return Promise.resolve(null);
	const msgId = ++msgSeq;
	// QUEUE-AWARE. The worker handles messages through a strictly serial FIFO
	// chain, but the timer starts when we POST — so a request sitting behind
	// others was charged for their run time as well as its own. `bake()` keeps 4
	// lanes in flight, so on a dense board (~2s per tile) the 4th request blew an
	// 8s budget while the worker was healthy and busy. Eight of those in a row
	// tripped MAX_CONSECUTIVE_TIMEOUTS and PAUSED the bakery for 30s, dumping
	// every tile onto the main thread — the "sharpening takes ages" report.
	//
	// Budget each request for its own work PLUS the work queued ahead of it, so a
	// timeout once again means "the worker is stuck", not "the worker is busy".
	const base = sawReply ? WARM_TIMEOUT_MS : COLD_TIMEOUT_MS;
	// Budget = own work (scaled by how many objects the tile actually holds)
	// + the work already queued ahead of it in the worker's serial FIFO chain.
	// A DENSE tile is slow, not stuck; charging it a flat budget is what tripped
	// MAX_CONSECUTIVE_TIMEOUTS and paused the bakery for 30s.
	const timeoutMs =
		(base + PER_OBJECT_TIMEOUT_MS * weight) * (1 + pending.size);
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			pending.delete(msgId);
			noteTimeout();
			resolve(null);
		}, timeoutMs);
		pending.set(msgId, { resolve, timer });
		msg.msgId = msgId;
		// Stamp the cancellation generation so the worker can drop this request if
		// a `cancel` overtakes it in the queue (see bakeryCancel).
		msg.epoch = epoch;
		try {
			w.postMessage(msg);
		} catch (err) {
			clearTimeout(timer);
			pending.delete(msgId);
			noteHardError();
			console.warn("[TileBakery] request postMessage failed", err);
			resolve(null);
		}
	});
}

/**
 * Whole-board overview render, off the main thread. `objects` are the z-ordered
 * objects covering the overview bounds (the WorldOverview already queried them).
 * Strokes go to the worker; text / images can't render there, so they come back
 * in `skipped` for the caller to overlay locally onto the returned bitmap.
 * Returns null → caller renders the whole overview locally (unchanged path).
 */
export async function bakeryRenderOverview(
	objects: FabricObject[],
	bounds: WorldRect,
	px: number,
	scale: number,
): Promise<{ bitmap: ImageBitmap; skipped: FabricObject[] } | null> {
	const w = getWorker();
	if (!w) return null;

	const ids: string[] = [];
	const skipped: FabricObject[] = [];
	for (const obj of objects) {
		const a = obj as any;
		if (!obj.id) return null;
		if (!shippable(a)) {
			skipped.push(obj); // text / image / grouped → overlaid on the main side
			continue;
		}
		ids.push(obj.id);
	}

	const request = (): Promise<BakeryResponse | null> =>
		track(w, {
			t: "overview",
			ids,
			bounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
			px,
			scale,
		}, ids.length);

	// Only THESE objects need to be current. The global dirty set drains on idle
	// — draining it here was the per-call main-thread spike (finding F1).
	flushObjects(w, objects);
	let res = await request();
	if (res?.aborted) return null; // cancelled by a gesture — not a failure

	if (res?.missing?.length) {
		// Mirror not seeded for these ids yet (e.g. first overview at load, before
		// any tile bake flushed them, or a freshly re-armed worker). Re-serialize
		// from the live objects we were handed, upsert, retry once — else fall
		// back to a local render.
		recordBakeMissingRetry();
		const items: { id: string; json: any }[] = [];
		for (const obj of objects) {
			if (res.missing.includes(obj.id)) {
				const json = serialize(obj);
				if (json) items.push({ id: obj.id, json });
			}
		}
		if (items.length !== res.missing.length) return null;
		postUpsert(w, items);
		res = await request();
		if (res?.aborted) return null;
	}

	if (!res || res.error || !res.bitmap) return null;
	return { bitmap: res.bitmap, skipped };
}

function refuse(reason: RefusalReason): null {
	recordTileRefused(reason);
	return null;
}

/**
 * Can the worker render this object at all? Text needs a registered face;
 * images, image-clips and grouped objects can't be shipped (group transforms
 * are group-relative, images have no worker element). Everything else — every
 * stroke type — ships.
 */
function workerCanRender(a: any): boolean {
	if (a.group) return false;
	if (hasImageClip(a)) return false;
	if (a.text !== undefined) return textRenderable(a);
	// Real user image → local bake (no fetch/CORS in the worker). Must precede
	// the asset check: a real image is also `instanceof FabricImage`.
	if (a.type === "image") return false;
	// Bitmap-backed stroke: renderable in the worker only once its pixels have
	// been transferred. Otherwise refused → local bake (previous behaviour), with
	// the transfer kicked off for next time. See shippable().
	if (isBitmapBacked(a)) {
		if (sentAssets.has(a.id)) return true;
		ensureAsset(a);
		return false;
	}
	return true;
}

/**
 * Remote baker handed to CommittedLayer.
 *
 * HYBRID (F3-C): objects the worker can render are baked off-thread; objects it
 * can't (an image, a group, text with an unloaded face) are returned in
 * `skipped` for the caller to overlay on the main thread. On a real board most
 * tiles are strokes plus the odd sticker — this bakes the strokes off-thread
 * and only paints the sticker locally, instead of refusing the whole tile.
 *
 * Correctness rests on ONE guard: `skipped` must all sit z-ABOVE everything
 * shipped, so "draw bitmap, then draw skipped over it" reproduces the true
 * stacking. `objects` arrive z-sorted ascending, so the shippable set must be a
 * PREFIX — the moment a shippable object appears after an un-shippable one, the
 * z-orders interleave and we bail to a full local bake (`null`).
 *
 * Returns null → caller does a full local render.
 */
export async function bakeryBakeTile(
	objects: FabricObject[],
	world: WorldRect,
	scale: number,
	overscan: number,
	size: number,
): Promise<RemoteBakeResult<FabricObject> | null> {
	const w = getWorker();
	if (!w) return null;

	const shippable: FabricObject[] = [];
	const ids: string[] = [];
	const skipped: FabricObject[] = [];
	let seenSkipped = false;
	for (const obj of objects) {
		const a = obj as any;
		// Transiently hidden (mid-drag hide by the transform controller): render
		// in NEITHER layer. The mirror still has them visible so the worker would
		// ghost them, and the local overlay renderer force-sets visible=true so it
		// would un-hide them too. Being invisible, they also don't affect z-order,
		// so skip them without tripping the prefix guard.
		if (a.opacity === 0 || a.visible === false) continue;

		if (workerCanRender(a) && obj.id) {
			// A shippable object ABOVE a skipped one → overlay-on-top would reorder
			// them. Bail to a full local bake.
			if (seenSkipped) return refuse("zorder");
			shippable.push(obj);
			ids.push(obj.id);
		} else {
			seenSkipped = true;
			skipped.push(obj);
		}
	}

	// Nothing for the worker to do (empty tile, or all overlay) → local render.
	// An empty tile is handled by the caller before we're even reached; an
	// all-skipped tile isn't worth a round-trip.
	if (ids.length === 0) return null;

	// NO global flush() here. Draining the WHOLE dirty set per tile — up to 192
	// synchronous toJSON() across four bake lanes inside an un-yieldable stretch
	// — was finding F1. Only THIS tile's shippable objects must be current.
	flushObjects(w, shippable);

	const request = (): Promise<BakeryResponse | null> =>
		track(w, {
			t: "bake",
			ids,
			world: { x: world.x, y: world.y, w: world.w, h: world.h },
			scale,
			overscan,
			size,
		}, ids.length);

	const bakeStartedAt = performance.now();
	let res = await request();

	// Dropped by a cancel (gesture start). Not a failure — don't blame the tile,
	// and don't retry. The caller's signal is already aborted, so it bails before
	// the main-thread fallback.
	if (res?.aborted) return null;

	if (res?.missing?.length) {
		// Self-heal once: re-upsert from the live refs, retry.
		recordBakeMissingRetry();
		const items: { id: string; json: any }[] = [];
		for (const obj of shippable) {
			if (res.missing.includes(obj.id)) {
				const json = serialize(obj);
				if (json) items.push({ id: obj.id, json });
			}
		}
		if (items.length !== res.missing.length) {
			recordTileFailed();
			return null;
		}
		postUpsert(w, items);
		res = await request();
		if (res?.aborted) return null;
	}

	if (!res || res.error || !res.bitmap) {
		recordTileFailed();
		return null;
	}
	recordTileRemote();
	recordBakeTiming(performance.now() - bakeStartedAt, ids.length);
	if (skipped.length) recordTileHybrid(skipped.length);
	return { bitmap: res.bitmap, skipped };
}
