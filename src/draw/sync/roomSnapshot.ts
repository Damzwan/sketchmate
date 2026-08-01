import type { Canvas } from "fabric";
import { useLayersStore } from "@/draw/layers/layers.store";

/**
 * Snapshot the live room canvas together with the mutable layer document.
 *
 * Fabric only knows about object `layerId` properties; the layer names and
 * ordering live in Pinia and therefore never appear in `canvas.toJSON()`.
 * Keeping this seam explicit prevents an existing solo drawing from losing its
 * layer document when it becomes the seed of a newly-created private room.
 * Public rooms return no document because their fixed layer set is derived by
 * every client locally.
 */
export function createRoomCanvasSnapshot(canvas: Canvas): any {
	const json = canvas.toJSON() as any;
	const layers = useLayersStore().serialize();
	if (layers) json.layers = layers;
	return json;
}
