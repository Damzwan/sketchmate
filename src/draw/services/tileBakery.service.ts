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

import type { FabricObject } from "fabric";
import type { WorldRect } from "@/draw/committedLayer";
import type { BakeryResponse } from "@/draw/types/tileBakery.types";

const BAKE_TIMEOUT_MS = 2500;
const MAX_FAILURES = 3;

interface PendingBake {
	resolve: (r: BakeryResponse | null) => void;
	timer: ReturnType<typeof setTimeout>;
}

let worker: Worker | null = null;
let disabled = false;
let failures = 0;
let msgSeq = 0;
const pending = new Map<number, PendingBake>();
/** id → live object ref; serialized lazily on flush. */
const dirty = new Map<string, FabricObject>();

function fail(): void {
	failures++;
	if (failures >= MAX_FAILURES) shutdown();
}

function shutdown(): void {
	disabled = true;
	console.warn(
		"[TileBakery] disabled after repeated failures — tile baking falls back to the main thread",
	);
	if (worker) {
		worker.terminate();
		worker = null;
	}
	for (const [, p] of pending) {
		clearTimeout(p.timer);
		p.resolve(null);
	}
	pending.clear();
	dirty.clear();
}

function getWorker(): Worker | null {
	if (disabled) return null;
	if (worker) return worker;
	if (typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") {
		disabled = true;
		return null;
	}
	try {
		worker = new Worker(
			new URL("../workers/tileBakery.worker.ts", import.meta.url),
			{
				type: "module",
			},
		);
	} catch {
		disabled = true;
		return null;
	}
	worker.onerror = () => fail();
	worker.onmessage = (e: MessageEvent<BakeryResponse>) => {
		const p = pending.get(e.data.msgId);
		if (!p) {
			// late reply after timeout — free the bitmap, it will never be used
			e.data.bitmap?.close();
			return;
		}
		pending.delete(e.data.msgId);
		clearTimeout(p.timer);
		p.resolve(e.data);
	};
	return worker;
}

/** Warm the worker during canvas init so the first bake doesn't pay spawn+parse. */
export function initTileBakery(): void {
	const w = getWorker();
	if (!w) return;
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
	w.postMessage({ t: "config", liveMax: lowEnd ? 2048 : 8192 });
}

export function isBakeryActive(): boolean {
	return !disabled && worker !== null;
}

export function bakeryMarkDirty(obj: FabricObject): void {
	if (disabled || !obj?.id) return;
	// The cached serialization is now stale — force a fresh toJSON at next flush.
	(obj as any).__bakeJSON = undefined;
	dirty.set(obj.id, obj);
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
	getWorker()?.postMessage({ t: "remove", ids: [id] });
}

export function bakeryClear(): void {
	if (disabled) return;
	dirty.clear();
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
function shippable(obj: any): boolean {
	if (obj.group) return false;
	if (obj.text !== undefined) return false;
	if (obj.type === "image") return false;
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
let idleFlushHandle: ReturnType<typeof setTimeout> | null = null;

function scheduleIdleFlush(): void {
	if (idleFlushHandle !== null || dirty.size === 0) return;
	const run = () => {
		idleFlushHandle = null;
		const w = getWorker();
		if (!w) return;
		flush(w);
		if (dirty.size > 0) scheduleIdleFlush();
	};
	const ric = (globalThis as any).requestIdleCallback;
	idleFlushHandle = ric
		? (ric(run, { timeout: 500 }) as any)
		: setTimeout(run, 0);
}

/** Seed the mirror ahead of the first bake, in idle-sized chunks. */
export function bakeryFlushSoon(): void {
	if (disabled) return;
	scheduleIdleFlush();
}

function flush(w: Worker): void {
	if (dirty.size === 0) return;
	const items: { id: string; json: any }[] = [];
	for (const [id, obj] of dirty) {
		if (items.length >= MAX_FLUSH_ITEMS) break;
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
	if (dirty.size > 0) scheduleIdleFlush(); // rest goes out between frames
}

/**
 * postMessage the upsert batch, surviving un-cloneable payloads.
 *
 * Some serialized objects carry a FUNCTION-valued property, which makes
 * structured clone throw DataCloneError. That used to escape out of `flush()`
 * — and because `flush` is called from `bakeryBakeTile`, the throw was caught
 * by rebuildTile's `try` around the remote baker and silently turned into a
 * local main-thread bake. So a single bad object could quietly disable
 * worker baking for the whole board: exactly the kind of silent degradation
 * that looks like "the worker isn't helping".
 *
 * Fast path stays allocation-free. Only on failure do we pay a JSON round-trip,
 * which drops function props (they are not renderable data anyway).
 */
/**
 * Force-sync the mirror for exactly these objects before a render that needs
 * them. MANDATORY: the general flush is capped (MAX_FLUSH_ITEMS) and drains the
 * rest on idle, so a render could otherwise proceed while the mirror still held
 * an OLD version of a dirty object. The worker HAS that id, just stale, so it
 * never reports `missing` and the self-heal never fires — the stale pixels come
 * back, `gen` has not moved, and they get stored as FRESH. That is a permanent
 * wrong tile at the current tier (it only looked fixed after zooming, because a
 * different tier baked from scratch). Cost is bounded by how many of THESE
 * objects are dirty, not by the scene.
 */
function flushObjects(w: Worker, objects: FabricObject[]): void {
	if (dirty.size === 0) return;
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
}

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

function requestBake(
	w: Worker,
	ids: string[],
	world: WorldRect,
	scale: number,
	overscan: number,
	size: number,
): Promise<BakeryResponse | null> {
	const msgId = ++msgSeq;
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			pending.delete(msgId);
			fail();
			resolve(null);
		}, BAKE_TIMEOUT_MS);
		pending.set(msgId, { resolve, timer });
		w.postMessage({
			t: "bake",
			msgId,
			ids,
			world: { x: world.x, y: world.y, w: world.w, h: world.h },
			scale,
			overscan,
			size,
		});
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

	const request = (): Promise<BakeryResponse | null> => {
		const msgId = ++msgSeq;
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				pending.delete(msgId);
				fail();
				resolve(null);
			}, BAKE_TIMEOUT_MS);
			pending.set(msgId, { resolve, timer });
			w.postMessage({
				t: "overview",
				msgId,
				ids,
				bounds: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
				px,
				scale,
			});
		});
	};

	flush(w);
	// MUST follow: the capped flush above may have left some of THESE objects
	// stale in the mirror, which renders wrong pixels that get stored as fresh.
	flushObjects(w, objects);
	let res = await request();

	if (res?.missing?.length) {
		// Mirror not seeded for these ids yet (e.g. first overview at load, before
		// any tile bake flushed them). Re-serialize from the live objects we were
		// handed, upsert, retry once — else fall back to a local render.
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
	}

	if (!res || res.error || !res.bitmap) return null;
	failures = 0;
	return { bitmap: res.bitmap, skipped };
}

/**
 * Remote baker handed to CommittedLayer. Returns the tile bitmap, or null to
 * make the caller fall back to the local (main-thread) renderer.
 */
export async function bakeryBakeTile(
	objects: FabricObject[],
	world: WorldRect,
	scale: number,
	overscan: number,
	size: number,
): Promise<ImageBitmap | null> {
	const w = getWorker();
	if (!w) return null;

	const ids: string[] = [];
	for (const obj of objects) {
		const a = obj as any;
		if (!obj.id) return null;
		// font fidelity: text renders with main-thread @font-face only
		if (a.text !== undefined) return null;
		// images never enter the worker (no fetch / CORS / img-mock) → main bake
		if (a.type === "image") return null;
		// group-relative transform / transiently hidden → live state only
		if (a.group) return null;
		if (a.opacity === 0 || a.visible === false) return null;
		ids.push(obj.id);
	}

	flush(w);
	// MUST follow: the capped flush above may have left some of THESE objects
	// stale in the mirror, which renders wrong pixels that get stored as fresh.
	flushObjects(w, objects);
	let res = await requestBake(w, ids, world, scale, overscan, size);

	if (res?.missing?.length) {
		// Self-heal once: re-upsert from the live refs, retry.
		const items: { id: string; json: any }[] = [];
		for (const obj of objects) {
			if (res.missing.includes(obj.id)) {
				const json = serialize(obj);
				if (json) items.push({ id: obj.id, json });
			}
		}
		if (items.length !== res.missing.length) return null;
		postUpsert(w, items);
		res = await requestBake(w, ids, world, scale, overscan, size);
	}

	if (!res || res.error || !res.bitmap) return null;
	failures = 0;
	return res.bitmap;
}
