import * as fabric from "fabric";
import { type Canvas, FabricObject, FabricObjectProps } from "fabric";
import { ObjectType } from "@/draw/types/draw.types";
import { HistoryAction } from "@/draw/types/drawHistory.types";
import { ref } from "vue";

export function toObjectsIds(objects: FabricObject[]): string[] {
	return objects.map((item) => item.id);
}

export function toJSON(objects: FabricObject[]): string[] {
	return objects.map((item) => serializeOnce(item));
}

/**
 * `obj.toJSON()`, computed at most ONCE per object per microtask tick.
 *
 * Committing a single stroke used to serialize it THREE times, all off the same
 * `object:added` dispatch:
 *   1. the sync engine, for the `draw-event` payload;
 *   2. the history manager, for the undo entry;
 *   3. the tile-bakery mirror (deferred, but the same unchanged object).
 * `toJSON()` on a long stroke is ~0.2 ms desktop / ~2 ms mid-Android, so that is
 * ~6 ms per stroke on the very frame that is also stamping tiles. Doing it once
 * and sharing the result cuts it to ~2 ms.
 *
 * The output is byte-identical to `toJSON()`, so the wire format, the history
 * entries and the stored drawings are all unchanged — this is purely
 * de-duplicated work, and fully backwards compatible.
 *
 * WHY A TICK, NOT A LONG-LIVED CACHE: an object can be mutated at any time, and
 * a stale serialization would silently corrupt an undo entry or a synced stroke.
 * Scoping the memo to one microtask makes staleness impossible — nothing mutates
 * an object between two handlers of the same synchronous event — while still
 * catching all three consumers above.
 *
 * INVARIANT: callers must treat the result as READ-ONLY. It is shared, so
 * mutating it would corrupt the other consumers. (Verified: every consumer only
 * reads — `insertedIndex` and friends are written to the live object, never to
 * the payload. Fabric's `fromObject` DOES mutate the JSON it is handed, but that
 * happens at enliven time — undo/redo/remote-apply — long after this tick.)
 */
let serializeMemo: WeakMap<object, any> | null = null;

export function serializeOnce(obj: FabricObject): any {
	if (!serializeMemo) {
		serializeMemo = new WeakMap();
		// Drop the memo at the end of the current tick, before anything can mutate.
		queueMicrotask(() => {
			serializeMemo = null;
		});
	}
	const cached = serializeMemo.get(obj);
	if (cached !== undefined) return cached;
	const json = (obj as any).toJSON();
	serializeMemo.set(obj, json);
	return json;
}

export function getAbsoluteState(
	obj: FabricObject,
): Partial<FabricObjectProps> {
	const matrix = obj.calcTransformMatrix();

	const decomposed = fabric.util.qrDecompose(matrix);

	return {
		left: decomposed.translateX,
		top: decomposed.translateY,
		scaleX: decomposed.scaleX,
		scaleY: decomposed.scaleY,
		angle: decomposed.angle,
	};
}
