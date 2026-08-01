import * as fabric from "fabric";
import { type Canvas, FabricObject, FabricObjectProps } from "fabric";
import { ObjectType } from "@/draw/objects/object.types";
import { HistoryAction } from "@/draw/history/history.types";
import { ref } from "vue";

export function toObjectsIds(objects: FabricObject[]): string[] {
	return objects.map((item) => item.id);
}

export function toJSON(objects: FabricObject[]): string[] {
	return objects.map((item) => serializeOnce(item));
}

const MUTATION_REVISION = "__drawMutationRevision";
const serializedByRevision = new WeakMap<
	object,
	{ revision: number; json: any }
>();

export function objectMutationRevision(obj: FabricObject): number {
	return Number((obj as any)[MUTATION_REVISION] ?? 0);
}

export function markObjectMutated(obj: FabricObject): void {
	(obj as any)[MUTATION_REVISION] = objectMutationRevision(obj) + 1;
}

export function rememberSerializedObject(obj: FabricObject, json: any): void {
	serializedByRevision.set(obj, {
		revision: objectMutationRevision(obj),
		json,
	});
}

/**
 * Return the last exact serialization while the object remains unchanged.
 * Rendering, history, and worker synchronization share this mutation revision.
 */
export function serializeAtRevision(obj: FabricObject): any {
	const revision = objectMutationRevision(obj);
	const cached = serializedByRevision.get(obj);
	if (cached?.revision === revision) return cached.json;

	const json = serializeOnce(obj);
	serializedByRevision.set(obj, { revision, json });
	return json;
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
 * The short-lived memo is also revision-aware. Most consumers run during one
 * event dispatch, but a mutation followed by serialization in the same turn
 * must still observe the new object state.
 *
 * INVARIANT: callers must treat the result as READ-ONLY. It is shared, so
 * mutating it would corrupt the other consumers. (Verified: every consumer only
 * reads — `insertedIndex` and friends are written to the live object, never to
 * the payload. Fabric's `fromObject` DOES mutate the JSON it is handed, but that
 * happens at enliven time — undo/redo/remote-apply — long after this tick.)
 */
let serializeMemo: WeakMap<object, { revision: number; json: any }> | null =
	null;

export function serializeOnce(obj: FabricObject): any {
	if (!serializeMemo) {
		serializeMemo = new WeakMap();
		// Drop the memo at the end of the current tick, before anything can mutate.
		queueMicrotask(() => {
			serializeMemo = null;
		});
	}
	const revision = objectMutationRevision(obj);
	const cached = serializeMemo.get(obj);
	if (cached?.revision === revision) return cached.json;
	const json = (obj as any).toJSON();
	serializeMemo.set(obj, { revision, json });
	rememberSerializedObject(obj, json);
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
