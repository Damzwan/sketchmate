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
		console.log("wow");
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
	getWorker();
}

export function isBakeryActive(): boolean {
	return !disabled && worker !== null;
}

export function bakeryMarkDirty(obj: FabricObject): void {
	if (disabled || !obj?.id) return;
	dirty.set(obj.id, obj);
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

function flush(w: Worker): void {
	if (dirty.size === 0) return;
	const items: { id: string; json: any }[] = [];
	for (const [id, obj] of dirty) {
		// A grouped object serializes group-relative — flushing it now would park
		// wrong coords in the mirror. Keep it dirty; it flushes after ungrouping.
		if ((obj as any).group) continue;
		const json = serialize(obj);
		if (json) items.push({ id, json });
		dirty.delete(id);
	}
	if (items.length) w.postMessage({ t: "upsert", items });
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
		// group-relative transform / transiently hidden → live state only
		if (a.group) return null;
		if (a.opacity === 0 || a.visible === false) return null;
		ids.push(obj.id);
	}

	flush(w);
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
		w.postMessage({ t: "upsert", items });
		res = await requestBake(w, ids, world, scale, overscan, size);
	}

	if (!res || res.error || !res.bitmap) return null;
	failures = 0;
	return res.bitmap;
}
