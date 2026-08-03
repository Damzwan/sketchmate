import * as fabric from "fabric";
import type { FabricObject } from "fabric";
import type { HistoryAction } from "@/draw/history/history.types";
import { HistoryEvent } from "@/draw/history/history.types";
import type { HistoryContext } from "@/draw/history/historyActions";
import { useLayersStore } from "@/draw/layers/layers.store";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";

/**
 * Undo/redo for the layer DOCUMENT (solo drawing only).
 *
 * These handlers use the store's `apply*` functions, never its public mutators:
 * the public ones record history, which inside an undo would push a second
 * entry and corrupt the stack.
 *
 * All of them are synchronous except the delete pair, which enlivens JSON.
 * `enqueueHistoryOp` in the history store serializes every op, so an async
 * handler is safe here — but it must never be invoked concurrently by any other
 * route.
 */

function restoreObjects(
	ctx: HistoryContext,
	objects: FabricObject[],
	layerId: string,
) {
	const manager = useDrawObjectManager();
	manager.beginBatch();
	try {
		for (const obj of objects) {
			// The recorded JSON already carries `layerId`; re-stamping is for
			// entries written before a later rename/merge of ids.
			(obj as any).layerId = layerId;
			const index = (obj as any).insertedIndex;
			if (
				typeof index === "number" &&
				index >= 0 &&
				index <= ctx.canvas.getObjects().length
			) {
				ctx.canvas.insertAt(index, obj);
			} else {
				ctx.canvas.add(obj);
			}
		}
	} finally {
		manager.endBatch();
	}
}

export async function undoLayerAdded(
	_ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.LayerAdded>,
) {
	useLayersStore().applyRemoveLayer(action.params.layer.id);
	return action;
}

export async function redoLayerAdded(
	_ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.LayerAdded>,
) {
	useLayersStore().applyAddLayer(action.params.layer);
	return action;
}

export async function undoLayerDeleted(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.LayerDeleted>,
) {
	const layers = useLayersStore();
	// Layer first: the objects' `layerId` must resolve to a real rank before
	// they are indexed, or they briefly sort as if they were on the base layer.
	layers.applyAddLayer(action.params.layer);
	const json = action.params.objectsJSON;
	if (json?.length) {
		const enlivened = await fabric.util.enlivenObjects<FabricObject>(json);
		const sorted = [...enlivened].sort(
			(a: any, b: any) =>
				((a.insertedIndex ?? Infinity) as number) -
				((b.insertedIndex ?? Infinity) as number),
		);
		restoreObjects(ctx, sorted, action.params.layer.id);
	}
	return action;
}

export async function redoLayerDeleted(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.LayerDeleted>,
) {
	const manager = useDrawObjectManager();
	const objects = manager
		.objectIdsOnLayer(action.params.layer.id)
		.map((id) => manager.getObjectById(id))
		.filter(Boolean) as FabricObject[];
	if (objects.length) {
		manager.beginBatch();
		try {
			ctx.canvas.remove(...objects);
		} finally {
			manager.endBatch();
		}
	}
	useLayersStore().applyRemoveLayer(action.params.layer.id);
	return action;
}

/**
 * Flatten undo/redo.
 *
 * The raster is replayed from the RECORDED JSON rather than re-rasterized: a
 * second encode of the same scene is not guaranteed to be byte-identical (nor
 * even to happen — the originals are off-canvas by then), and a redo that
 * silently changes the picture is worse than the work it saves.
 */
async function enliven(json: any[]): Promise<FabricObject[]> {
	if (!json?.length) return [];
	return await fabric.util.enlivenObjects<FabricObject>(json);
}

function objectsOnLayer(layerId: string): FabricObject[] {
	const manager = useDrawObjectManager();
	return manager
		.objectIdsOnLayer(layerId)
		.map((id) => manager.getObjectById(id))
		.filter(Boolean) as FabricObject[];
}

/** Swap a layer's whole content in ONE batch. Enlivening happens first, on
 *  purpose: an await inside an open batch leaves the manager mid-transaction
 *  across an image decode. */
function swapLayerContent(
	ctx: HistoryContext,
	layerId: string,
	remove: FabricObject[],
	add: FabricObject[],
) {
	const manager = useDrawObjectManager();
	manager.beginBatch();
	try {
		if (remove.length) ctx.canvas.remove(...remove);
		for (const obj of add) {
			(obj as any).layerId = layerId;
			const index = (obj as any).insertedIndex;
			if (
				typeof index === "number" &&
				index >= 0 &&
				index <= ctx.canvas.getObjects().length
			) {
				ctx.canvas.insertAt(index, obj);
			} else {
				ctx.canvas.add(obj);
			}
		}
	} finally {
		manager.endBatch();
	}
}

export async function undoLayerFlattened(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.LayerFlattened>,
) {
	const { layerId, objectsJSON, imagesJSON } = action.params;
	const enlivened = await enliven(objectsJSON);
	const sorted = [...enlivened].sort(
		(a: any, b: any) =>
			((a.insertedIndex ?? Infinity) as number) -
			((b.insertedIndex ?? Infinity) as number),
	);
	// Remove by recorded id rather than "everything on the layer": a peer applying
	// this over the wire may have had other content land there since.
	const manager = useDrawObjectManager();
	const rasters = (imagesJSON ?? [])
		.map((json: any) => (json?.id ? manager.getObjectById(json.id) : null))
		.filter(Boolean) as FabricObject[];
	swapLayerContent(ctx, layerId, rasters, sorted);
	return action;
}

export async function redoLayerFlattened(
	ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.LayerFlattened>,
) {
	const { layerId, imagesJSON } = action.params;
	const enlivened = await enliven(imagesJSON ?? []);
	swapLayerContent(ctx, layerId, objectsOnLayer(layerId), enlivened);
	return action;
}

export async function undoLayerRenamed(
	_ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.LayerRenamed>,
) {
	useLayersStore().applyRename(
		action.params.layerId,
		action.params.previousName,
	);
	return action;
}

export async function redoLayerRenamed(
	_ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.LayerRenamed>,
) {
	useLayersStore().applyRename(action.params.layerId, action.params.name);
	return action;
}

export async function undoLayerReordered(
	_ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.LayerReordered>,
) {
	useLayersStore().applyReorder(
		action.params.layerId,
		action.params.previousOrder,
	);
	return action;
}

export async function redoLayerReordered(
	_ctx: HistoryContext,
	action: HistoryAction<HistoryEvent.LayerReordered>,
) {
	useLayersStore().applyReorder(action.params.layerId, action.params.order);
	return action;
}
