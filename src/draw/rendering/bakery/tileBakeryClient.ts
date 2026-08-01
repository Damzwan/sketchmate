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
// Objects kept out of worker tiles:
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

import type { FabricObject } from "fabric";
import type {
	RemoteBakeFailure,
	RemoteBakeResult,
	WorldRect,
} from "@/draw/rendering/committedLayer";
import type { BakeryResponse } from "@/draw/rendering/bakery/bakery.types";
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
	recordWorkerCancelRequests,
	recordWorkerCancelResult,
	recordSceneCommit,
	recordWorkerMessage,
	recordWorkerQueueDepth,
	recordWorkerTiming,
	setWorkerProtocolVersion,
	type RefusalReason,
} from "@/draw/rendering/renderMetrics";
import { BakeryAssets } from "@/draw/rendering/bakery/assets";
import {
	BAKERY_PAUSE_MS,
	BakeryHealth,
	MAX_BAKERY_IN_FLIGHT,
} from "@/draw/rendering/bakery/health";
import {
	type PendingBake,
	requestTimeoutMs,
	SceneRevisionClock,
	type SceneDelta,
	WORKER_PROTOCOL_VERSION,
} from "@/draw/rendering/bakery/protocol";
import { getWorkerProtocolMode } from "@/draw/config/workerProtocol.config";
import { serializeOnce } from "@/draw/objects/objectSerialization";

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

let worker: Worker | null = null;
/**
 * Explicit experiment gate. This is separate from `disabled`: main-thread mode
 * is a healthy, intentional cohort and must not count as a bakery failure.
 */
let enabled = true;
/** Permanent for this session. Unsupported env, or too many pauses. */
let disabled = false;
/** Wall-clock ms; > 0 means paused. Re-arms once `Date.now()` passes it. */
let pausedUntil = 0;
let msgSeq = 0;
/**
 * Cancellation generation. Bumped by `bakeryCancel()` (gesture start) and
 * stamped onto every bake / overview request, so the worker can drop work that
 * belongs to an abandoned pass instead of rasterizing pixels nobody will use.
 */
let epoch = 0;
let liveMaxConfig = 8192;
let idleMaxConfig = 768;
let jsonMaxBytesConfig = 96 * 1024 * 1024;
/**
 * Font families the worker has registered in its own FontFaceSet.
 *
 * Empty until the worker reports back (and permanently empty where
 * WorkerGlobalScope.fonts is unsupported), so text tiles are refused by
 * default — a face the worker lacks would bake FALLBACK GLYPHS into a
 * committed tile, which is a correctness bug, not a perf trade. Cleared on
 * teardown because a re-armed worker must re-register before we trust it.
 */
const pending = new Map<number, PendingBake>();
/** Requests settled locally by bakeryCancel, awaiting the worker's eventual
 * reply so we can measure how long it actually remained busy. */
const cancelledAt = new Map<number, number>();
/** id → live object ref; serialized lazily on flush. */
const dirty = new Map<string, FabricObject>();
const health = new BakeryHealth();
const sceneClock = new SceneRevisionClock();
const assets = new BakeryAssets((id, bitmap, bytes) => {
	const activeWorker = getWorker();
	if (!activeWorker) return false;
	const objectRevision = usesProtocolV2()
		? sceneClock.nextObjectRevision(id)
		: undefined;
	postMeasured(
		activeWorker,
		{ t: "asset", id, bitmap, objectRevision },
		[bitmap],
		bytes,
	);
	return true;
});
let sceneBatchDepth = 0;
let batchedSceneDeltas: SceneDelta[] = [];

function usesProtocolV2(): boolean {
	return getWorkerProtocolMode() === "v2";
}

interface SerializedItem {
	id: string;
	json: any;
	bounds?: { x: number; y: number; w: number; h: number };
	z?: number;
}

function serializedItem(obj: FabricObject, json: any): SerializedItem {
	const source = obj as any;
	return {
		id: obj.id,
		json,
		bounds: source.__br ? { ...source.__br } : undefined,
		z: typeof source.__z === "number" ? source.__z : undefined,
	};
}

function postMeasured(
	w: Worker,
	message: Record<string, unknown>,
	transfer?: Transferable[],
	estimatedBytes = 0,
): void {
	const startedAt = performance.now();
	if (transfer) w.postMessage(message, transfer);
	else w.postMessage(message);
	recordPhase("workerPrepPost", performance.now() - startedAt);
	recordWorkerMessage(estimatedBytes);
}

function estimateItemBytes(item: SerializedItem): number {
	const json = item.json;
	if (typeof json === "string") return item.id.length * 2 + json.length * 2;
	const pathLength = Array.isArray(json?.path) ? json.path.length : 0;
	const traceLength =
		typeof json?.compressedTrace === "string"
			? json.compressedTrace.length * 2
			: 0;
	return 256 + item.id.length * 2 + pathLength * 32 + traceLength;
}

function isPaused(): boolean {
	if (!pausedUntil) return false;
	if (Date.now() < pausedUntil) return true;
	rearm();
	return false;
}

function rearm(): void {
	pausedUntil = 0;
	health.rearm();
	// The terminated worker took its mirror with it. Nothing is re-seeded
	// eagerly: objects marked dirty DURING the pause are still parked here and
	// go out on the next idle flush, and any id the fresh worker does not have
	// comes back `{ missing }` and is re-upserted by the existing self-heal.
}

function noteReply(): void {
	health.noteReply();
}

function noteTimeout(): void {
	recordBakeTimeout();
	if (health.noteTimeout()) pause("timeout");
}

function noteHardError(): void {
	recordBakeHardError();
	if (health.noteHardError()) pause("error");
}

function pause(reason: "timeout" | "error"): void {
	if (!enabled || disabled || pausedUntil) return;
	recordBakeryPause(reason);
	teardown();
	if (health.notePause()) {
		disable(`repeated ${reason} pauses`);
		return;
	}
	pausedUntil = Date.now() + BAKERY_PAUSE_MS;
	console.warn(
		`[TileBakery] paused for ${BAKERY_PAUSE_MS}ms after ${reason}; tiles bake on the main thread until it re-arms`,
	);
}

function disable(reason: string): void {
	disabled = true;
	recordBakeryDisabled();
	teardown();
	// NB: dirty is only cleared here, on the permanent path. A PAUSE keeps the
	// parked refs so the re-armed worker gets seeded from them.
	//
	// Release their stashed source JSON too: nothing will ever ship it now, and
	// these are the objects of a session that just proved it is memory- or
	// CPU-starved. Leaving the blobs attached doubles the scene's footprint at
	// the worst possible moment.
	for (const parked of dirty.values()) {
		(parked as any).__bakeJSON = undefined;
	}
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
	// The terminated worker took every transferred bitmap with it. Keeping the
	// main-side `sentAssets` set would make a fresh worker appear asset-complete,
	// so bitmap-backed strokes could be omitted from worker tiles. This also
	// invalidates createImageBitmap promises that may still resolve later.
	assets.reset(true);
	for (const [, p] of pending) {
		clearTimeout(p.timer);
		p.resolve(null);
	}
	pending.clear();
	cancelledAt.clear();
}

/** End one drawing session without disabling the worker backend for the next. */
export function shutdownTileBakerySession(): void {
	if (idleFlushHandle !== null) {
		const cancelIdle = (globalThis as any).cancelIdleCallback;
		if (typeof cancelIdle === "function") cancelIdle(idleFlushHandle);
		clearTimeout(idleFlushHandle);
		idleFlushHandle = null;
	}
	teardown();
	for (const parked of dirty.values()) (parked as any).__bakeJSON = undefined;
	dirty.clear();
	flushPaused = false;
	sceneBatchDepth = 0;
	batchedSceneDeltas = [];
	pausedUntil = 0;
	sceneClock.resetObjects();
}

function getWorker(): Worker | null {
	if (!enabled || disabled) return null;
	if (isPaused()) return null;
	if (worker) return worker;
	if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
		disable("no Worker / OffscreenCanvas");
		return null;
	}
	try {
		worker = new Worker(
			new URL("../../workers/tileBakery.worker.ts", import.meta.url),
			{ type: "module" },
		);
	} catch {
		disable("worker construction threw");
		return null;
	}
	worker.onerror = () => noteHardError();
	worker.onmessage = (e: MessageEvent<BakeryResponse>) => {
		const responseStartedAt = performance.now();
		try {
			// Unsolicited notification: which font families the worker registered.
			// Until this lands, `workerFonts` is empty and every text tile is refused
			// — the safe default.
			if (e.data.fonts !== undefined) {
				assets.setFonts(e.data.fonts);
				noteReply();
				return;
			}
			recordWorkerTiming(e.data.workerTiming);
			const cancelStartedAt = cancelledAt.get(e.data.msgId);
			if (cancelStartedAt !== undefined) {
				cancelledAt.delete(e.data.msgId);
				recordWorkerCancelResult(
					performance.now() - cancelStartedAt,
					e.data.aborted === true,
				);
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
			if (
				p.expectedSceneRevision !== undefined &&
				e.data.sceneRevision !== p.expectedSceneRevision
			) {
				e.data.bitmap?.close();
				noteReply();
				p.resolve({
					msgId: e.data.msgId,
					error: "scene-revision-mismatch",
				});
				return;
			}
			// Any reply — including `{ missing }` and `{ aborted }` — means the worker
			// is alive. An `aborted` reply is our OWN cancel coming back, so it is
			// proof of life and must never touch the hard-failure budget.
			if (e.data.error) noteHardError();
			else noteReply();
			p.resolve(e.data);
		} finally {
			recordPhase(
				"workerResponseDispatch",
				performance.now() - responseStartedAt,
			);
		}
	};
	// Re-send config on every spawn: after a re-arm the fresh worker would
	// otherwise sit at its default LIVE_MAX and thrash its enliven cache.
	postMeasured(worker, {
		t: "config",
		liveMax: liveMaxConfig,
		idleMax: idleMaxConfig,
		jsonMaxBytes: jsonMaxBytesConfig,
	});
	return worker;
}

/**
 * Select whether this module participates in rendering at all.
 *
 * Disabling tears down the worker and drops its mirror bookkeeping. All public
 * sync hooks become no-ops, so main-thread A/B mode does not secretly pay worker
 * serialization, message or bitmap costs.
 */
export function configureTileBakery(on: boolean): void {
	if (enabled === on) return;
	enabled = on;
	if (on) return;
	teardown();
	dirty.clear();
	flushPaused = false;
}

/** Warm the worker during canvas init so the first bake doesn't pay spawn+parse. */
export function initTileBakery(): void {
	if (!enabled) return;
	setWorkerProtocolVersion(usesProtocolV2() ? WORKER_PROTOCOL_VERSION : 1);
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
	const deviceMemory = (navigator as any)?.deviceMemory || (mobile ? 4 : 8);
	const lowEnd = mobile && (hw <= 4 || deviceMemory <= 4);
	liveMaxConfig = lowEnd ? 2048 : 8192;
	// Active bakes keep their large working set. After a genuinely idle period,
	// collapse both duplicate worker representations. Evicted JSON self-heals
	// through the existing `{ missing }` retry on the next relevant tile.
	idleMaxConfig = lowEnd ? 128 : mobile ? 256 : 768;
	jsonMaxBytesConfig = (lowEnd ? 24 : mobile ? 48 : 96) * 1024 * 1024;
	getWorker(); // spawn now; the config message goes out with it
}

export function isBakeryActive(): boolean {
	return enabled && !disabled && !isPaused() && worker !== null;
}

/**
 * ABANDON every bake / overview currently issued. Call at gesture start.
 *
 * `RenderEngine.abortBakes()` only aborts the MAIN-THREAD loop: requests already
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
 * cancel is for. `RenderEngine.setGesturing(true)` aborts first, then calls this.
 */
export function bakeryCancel(): void {
	if (!enabled || disabled) return;
	epoch++;
	const now = performance.now();
	let cancelled = 0;
	for (const [msgId, p] of pending) {
		cancelledAt.set(msgId, now);
		cancelled++;
		clearTimeout(p.timer);
		p.resolve(null);
	}
	if (cancelled) recordWorkerCancelRequests(cancelled);
	pending.clear();
	// No getWorker() here: it would re-arm a paused bakery just to tell it to
	// cancel work it never received.
	worker?.postMessage({ t: "cancel", epoch });
}

export function bakeryMarkDirty(obj: FabricObject): void {
	if (!enabled || disabled || !obj?.id) return;
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
	if (!enabled || disabled || !obj?.id) return;
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
	const worker = getWorker();
	if (!worker) return;
	if (usesProtocolV2()) {
		postSceneDeltas(worker, [
			{
				kind: "clip",
				id: obj.id,
				objectRevision: sceneClock.nextObjectRevision(obj.id),
				clip,
			},
		]);
	} else {
		postMeasured(worker, { t: "clipSet", id: obj.id, clip });
	}
}

/**
 * Seed the mirror straight from the JSON the object was enlivened FROM — no
 * toJSON. Used at load, where re-serializing N objects we just deserialized was
 * the main-thread spike (and crash) on big canvases. Stashes the blob on the
 * object so flush ships it as-is until the object actually mutates.
 */
export function bakerySeed(obj: FabricObject, srcJSON: any): void {
	if (!obj?.id) return;
	// The loader stashes `__bakeJSON` on EVERY enlivened object before it knows
	// whether the bakery wants it. If we are not going to ship it, drop it here —
	// otherwise the full parsed source JSON of every object (for a watercolour
	// stroke, its entire trace) stays alive for the whole session next to the
	// live object that was built from it. That is a silent second copy of the
	// scene, and it bites hardest exactly where it hurts: the main-thread render
	// backend, and any device whose bakery hit the kill-switch.
	if (!enabled || disabled || !srcJSON) {
		(obj as any).__bakeJSON = undefined;
		return;
	}
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
	if (!enabled || disabled || ids.length === 0) return;
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
	const worker = getWorker();
	if (!worker) return;
	if (usesProtocolV2()) {
		postSceneDeltas(worker, [
			{
				kind: "translate",
				ids,
				objectRevisions: sceneClock.nextObjectRevisions(ids),
				dx,
				dy,
			},
		]);
	} else {
		postMeasured(worker, { t: "translate", ids, dx, dy });
	}
}

export function bakeryRemove(id: string): void {
	if (!enabled || disabled || !id) return;
	dirty.delete(id);
	assets.forget(id);
	const worker = getWorker();
	if (!worker) return;
	if (usesProtocolV2()) {
		postSceneDeltas(worker, [
			{
				kind: "remove",
				id,
				objectRevision: sceneClock.nextObjectRevision(id),
			},
		]);
	} else {
		postMeasured(worker, { t: "remove", ids: [id] });
	}
}

export function bakeryZOrder(ids: string[], z: number[]): void {
	if (
		!enabled ||
		disabled ||
		ids.length === 0 ||
		ids.length !== z.length ||
		!usesProtocolV2()
	) {
		return;
	}
	const worker = getWorker();
	if (!worker) return;
	postSceneDeltas(worker, [
		{
			kind: "zOrder",
			ids,
			objectRevisions: sceneClock.nextObjectRevisions(ids),
			z,
		},
	]);
}

export function bakeryClear(): void {
	if (!enabled || disabled) return;
	dirty.clear();
	assets.reset();
	sceneClock.resetObjects();
	const worker = getWorker();
	if (!worker) return;
	if (usesProtocolV2()) postSceneDeltas(worker, [{ kind: "reset" }]);
	else postMeasured(worker, { t: "clear" });
}

function serialize(obj: FabricObject): any | null {
	const startedAt = performance.now();
	try {
		return serializeOnce(obj);
	} catch {
		return null;
	} finally {
		recordPhase("workerPrepSerialize", performance.now() - startedAt);
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
/** Deadline used when resuming after a gesture — must beat RenderEngine's
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
	if (!enabled || disabled) return;
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
	if (idleFlushHandle !== null || dirty.size === 0 || !enabled || disabled)
		return;
	if (flushPaused) return; // re-armed by bakeryPauseFlush(false)
	const run = (deadline?: { timeRemaining(): number }) => {
		idleFlushHandle = null;
		if (!enabled || disabled || flushPaused) return;
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
	if (!enabled || disabled) return;
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
	const items: SerializedItem[] = [];
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
		if (!assets.canShip(a)) {
			dirty.delete(id);
			continue;
		}
		// Prefer the stashed source JSON (load / unchanged) over a fresh toJSON —
		// that recursive serialization is the main-thread cost we are avoiding.
		const json = a.__bakeJSON ?? serialize(obj);
		if (json) items.push(serializedItem(obj, json));
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
	const items: SerializedItem[] = [];
	for (const obj of objects) {
		const id = obj.id;
		if (!id || !dirty.has(id)) continue;
		const a = obj as any;
		if (a.group) continue; // still group-relative — cannot ship yet
		if (!assets.canShip(a)) {
			dirty.delete(id);
			continue;
		}
		const json = a.__bakeJSON ?? serialize(obj);
		if (json) items.push(serializedItem(obj, json));
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
 * Overview variant of flushObjects. A whole-board request can touch thousands
 * of dirty objects, so one postMessage would structured-clone the whole scene
 * in a single main-thread task. Ship small batches and yield between them.
 */
async function flushObjectsYielded(
	w: Worker,
	objects: FabricObject[],
): Promise<void> {
	let items: SerializedItem[] = [];
	let sliceStart = performance.now();
	const yieldFrame = () =>
		new Promise<void>((resolve) => {
			if (typeof requestAnimationFrame === "function") {
				requestAnimationFrame(() => resolve());
			} else {
				setTimeout(resolve, 0);
			}
		});

	for (const obj of objects) {
		const id = obj.id;
		if (!id || !dirty.has(id)) continue;
		const a = obj as any;
		if (a.group) continue;
		if (!assets.canShip(a)) {
			dirty.delete(id);
			continue;
		}
		const json = a.__bakeJSON ?? serialize(obj);
		if (json) items.push(serializedItem(obj, json));
		a.__bakeJSON = undefined;
		dirty.delete(id);

		if (items.length >= 32 || performance.now() - sliceStart >= 4) {
			postUpsert(w, items);
			items = [];
			await yieldFrame();
			sliceStart = performance.now();
		}
	}
	if (items.length) postUpsert(w, items);
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
function postSceneDeltas(w: Worker, deltas: SceneDelta[]): void {
	if (sceneBatchDepth > 0) {
		batchedSceneDeltas.push(...deltas);
		return;
	}
	const chunks = sceneClock.commit(deltas);
	if (chunks.length === 0) return;
	recordSceneCommit(deltas.length);
	for (const chunk of chunks) {
		const bytes =
			128 +
			chunk.deltas.reduce((total, delta) => {
				if (delta.kind !== "upsert") return total + 64;
				return total + estimateItemBytes({ id: delta.id, json: delta.json });
			}, 0);
		try {
			postMeasured(w, chunk as any, undefined, bytes);
		} catch {
			try {
				postMeasured(w, JSON.parse(JSON.stringify(chunk)), undefined, bytes);
			} catch (error) {
				console.warn(
					"[TileBakery] dropped an un-serializable scene commit",
					error,
				);
			}
		}
	}
}

/**
 * Groups the direct deltas produced by one history/sync operation into a
 * single scene revision. Nested batches are supported because draw actions can
 * wrap helpers that already batch.
 */
export function bakeryBeginSceneBatch(): void {
	if (!enabled || disabled || !usesProtocolV2()) return;
	sceneBatchDepth++;
}

export function bakeryEndSceneBatch(): void {
	if (!enabled || disabled || !usesProtocolV2() || sceneBatchDepth === 0)
		return;
	sceneBatchDepth--;
	if (sceneBatchDepth > 0 || batchedSceneDeltas.length === 0) return;
	const deltas = batchedSceneDeltas;
	batchedSceneDeltas = [];
	const worker = getWorker();
	if (worker) postSceneDeltas(worker, deltas);
}

function postUpsert(w: Worker, items: SerializedItem[]): void {
	if (usesProtocolV2()) {
		postSceneDeltas(
			w,
			items.map((item) => ({
				kind: "upsert",
				id: item.id,
				objectRevision: sceneClock.nextObjectRevision(item.id),
				json: item.json,
				bounds: item.bounds,
				z: item.z,
			})),
		);
		return;
	}

	const estimatedBytes = items.reduce(
		(total, item) => total + estimateItemBytes(item),
		64,
	);
	try {
		postMeasured(w, { t: "upsert", items }, undefined, estimatedBytes);
		return;
	} catch {
		/* falls through to the sanitized retry */
	}
	try {
		postMeasured(
			w,
			{ t: "upsert", items: JSON.parse(JSON.stringify(items)) },
			undefined,
			estimatedBytes,
		);
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
function track(
	w: Worker,
	msg: Record<string, unknown>,
	/** Objects this request must enliven + render — its real cost driver. */
	weight = 0,
): Promise<BakeryResponse | null> {
	// Back-pressure: never pile more onto a worker that is already behind.
	if (pending.size >= MAX_BAKERY_IN_FLIGHT) {
		return Promise.resolve({ msgId: -1, error: "backpressure" });
	}
	const msgId = ++msgSeq;
	const expectedSceneRevision = usesProtocolV2()
		? sceneClock.currentSceneRevision
		: undefined;
	if (expectedSceneRevision !== undefined) {
		msg.sceneRevision = expectedSceneRevision;
	}
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
	const timeoutMs = requestTimeoutMs(
		health.baseTimeoutMs,
		weight,
		pending.size,
	);
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			pending.delete(msgId);
			noteTimeout();
			resolve({ msgId, error: "timeout" });
		}, timeoutMs);
		pending.set(msgId, { resolve, timer, expectedSceneRevision });
		recordWorkerQueueDepth(pending.size);
		msg.msgId = msgId;
		// Stamp the cancellation generation so the worker can drop this request if
		// a `cancel` overtakes it in the queue (see bakeryCancel).
		msg.epoch = epoch;
		try {
			const estimatedBytes = 128 + weight * 40;
			postMeasured(w, msg, undefined, estimatedBytes);
		} catch (err) {
			clearTimeout(timer);
			pending.delete(msgId);
			noteHardError();
			console.warn("[TileBakery] request postMessage failed", err);
			resolve({ msgId, error: "hard-error" });
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
	width: number,
	height: number,
	scale: number,
): Promise<{ bitmap: ImageBitmap; skipped: FabricObject[] } | null> {
	const w = getWorker();
	if (!w) return null;

	const ids: string[] = [];
	const skipped: FabricObject[] = [];
	const classifyStartedAt = performance.now();
	for (const obj of objects) {
		const a = obj as any;
		if (!obj.id) return null;
		if (!assets.canShip(a)) {
			skipped.push(obj); // text / image / grouped → overlaid on the main side
			continue;
		}
		ids.push(obj.id);
	}
	recordPhase("workerPrepClassify", performance.now() - classifyStartedAt);

	const request = (): Promise<BakeryResponse | null> =>
		track(
			w,
			{
				t: "overview",
				ids,
				bounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
				width,
				height,
				scale,
			},
			ids.length,
		);

	// Only THESE objects need to be current. The global dirty set drains on idle
	// — draining it here was the per-call main-thread spike (finding F1).
	await flushObjectsYielded(w, objects);
	let res = await request();
	if (res?.aborted) return null; // cancelled by a gesture — not a failure

	if (res?.missing?.length) {
		// Mirror not seeded for these ids yet (e.g. first overview at load, before
		// any tile bake flushed them, or a freshly re-armed worker). Re-serialize
		// from the live objects we were handed, upsert, retry once — else fall
		// back to a local render.
		recordBakeMissingRetry();
		const items: SerializedItem[] = [];
		for (const obj of objects) {
			if (res.missing.includes(obj.id)) {
				const json = serialize(obj);
				if (json) items.push(serializedItem(obj, json));
			}
		}
		if (items.length !== res.missing.length) return null;
		postUpsert(w, items);
		res = await request();
		if (res?.aborted) return null;
	}

	if (!res || res.error || !res.bitmap) return null;
	recordWorkerMessage(0, width * height * 4);
	return { bitmap: res.bitmap, skipped };
}

/**
 * Pre-render a large selection for the GPU drag layer without touching Fabric
 * on the main thread. This uses only objects already committed to the worker
 * mirror: a missing, dirty, or unsupported object makes the request decline,
 * leaving the transform controller's compatibility path in charge.
 */
export async function bakeryRenderSelection(
	objects: FabricObject[],
	bounds: WorldRect,
	width: number,
	height: number,
): Promise<ImageBitmap | null> {
	const w = getWorker();
	if (!w || width <= 0 || height <= 0) return null;

	const ids: string[] = [];
	for (const obj of objects) {
		if (
			!obj.id ||
			dirty.has(obj.id) ||
			assets.refusalReason(obj as any) !== null
		) {
			return null;
		}
		ids.push(obj.id);
	}

	const res = await track(
		w,
		{
			t: "overview",
			ids,
			bounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
			width,
			height,
			scale: Math.max(width / bounds.w, height / bounds.h),
		},
		ids.length,
	);
	if (!res || res.aborted || res.error || res.missing?.length || !res.bitmap) {
		res?.bitmap?.close();
		return null;
	}
	recordWorkerMessage(0, width * height * 4);
	return res.bitmap;
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
): Promise<RemoteBakeResult<FabricObject> | RemoteBakeFailure> {
	const w = getWorker();
	if (!w) return { kind: "failed", fallbackReason: "worker-unavailable" };

	const shippable: FabricObject[] = [];
	const ids: string[] = [];
	const skipped: FabricObject[] = [];
	let seenSkipped = false;
	let firstRefusal: RefusalReason | null = null;
	const classifyStartedAt = performance.now();
	for (const obj of objects) {
		const a = obj as any;
		// Transiently hidden (mid-drag hide by the transform controller): render
		// in NEITHER layer. The mirror still has them visible so the worker would
		// ghost them, and the local overlay renderer force-sets visible=true so it
		// would un-hide them too. Being invisible, they also don't affect z-order,
		// so skip them without tripping the prefix guard.
		if (a.opacity === 0 || a.visible === false) continue;

		const selectedWithPendingFullSync =
			!!obj.id &&
			dirty.has(obj.id) &&
			String(a.group?.type ?? "").toLowerCase() === "activeselection";
		const refusalReason = selectedWithPendingFullSync
			? "grouped"
			: assets.refusalReason(a);
		if (!refusalReason && obj.id) {
			// A shippable object ABOVE a skipped one → overlay-on-top would reorder
			// them. Bail to a full local bake.
			if (seenSkipped) {
				recordPhase(
					"workerPrepClassify",
					performance.now() - classifyStartedAt,
				);
				refuse("zorder");
				return { kind: "unsupported", fallbackReason: "z-order" };
			}
			shippable.push(obj);
			ids.push(obj.id);
		} else {
			seenSkipped = true;
			skipped.push(obj);
			firstRefusal ??= refusalReason ?? "noId";
		}
	}
	recordPhase("workerPrepClassify", performance.now() - classifyStartedAt);

	// Nothing for the worker to do (empty tile, or all overlay) → local render.
	// An empty tile is handled by the caller before we're even reached; an
	// all-skipped tile isn't worth a round-trip.
	if (ids.length === 0) {
		refuse(firstRefusal ?? "noId");
		return { kind: "unsupported", fallbackReason: "refusal" };
	}
	const requestEpoch = epoch;

	// NO global flush() here. Draining the WHOLE dirty set per tile — up to 192
	// synchronous toJSON() across four bake lanes inside an un-yieldable stretch
	// — was finding F1. Only THIS tile's shippable objects must be current.
	flushObjects(w, shippable);

	const request = (): Promise<BakeryResponse | null> =>
		track(
			w,
			{
				t: "bake",
				ids,
				world: { x: world.x, y: world.y, w: world.w, h: world.h },
				scale,
				overscan,
				size,
			},
			ids.length,
		);

	const bakeStartedAt = performance.now();
	let res = await request();

	// Dropped by a cancel (gesture start). Not a failure — don't blame the tile,
	// and don't retry. The caller's signal is already aborted, so it bails before
	// the main-thread fallback.
	if (epoch !== requestEpoch || res?.aborted) {
		return { kind: "deferred", fallbackReason: "backpressure" };
	}

	if (res?.missing?.length) {
		// Self-heal once: re-upsert from the live refs, retry.
		recordBakeMissingRetry();
		const items: SerializedItem[] = [];
		for (const obj of shippable) {
			if (res.missing.includes(obj.id)) {
				const json = serialize(obj);
				if (json) items.push(serializedItem(obj, json));
			}
		}
		if (items.length !== res.missing.length) {
			recordTileFailed();
			return { kind: "deferred", fallbackReason: "missing" };
		}
		postUpsert(w, items);
		res = await request();
		if (epoch !== requestEpoch || res?.aborted) {
			return { kind: "deferred", fallbackReason: "backpressure" };
		}
	}

	if (!res || res.error || !res.bitmap) {
		recordTileFailed();
		const reason =
			res?.error === "backpressure"
				? "backpressure"
				: res?.error === "timeout"
					? "timeout"
					: res?.error === "scene-revision-mismatch" ||
							res?.error === "scene revision not committed" ||
							res?.error === "stale scene revision"
						? "missing"
						: res?.missing?.length
							? "missing"
							: "hard-error";
		return {
			kind:
				reason === "backpressure" || reason === "missing"
					? "deferred"
					: "failed",
			fallbackReason: reason,
		};
	}
	recordTileRemote();
	recordBakeTiming(performance.now() - bakeStartedAt, ids.length);
	recordWorkerMessage(0, size * size * 4);
	if (skipped.length) recordTileHybrid(skipped.length);
	return { bitmap: res.bitmap, skipped };
}
