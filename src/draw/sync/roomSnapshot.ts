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

/**
 * The same snapshot, as gzipped bytes, WITHOUT ever blocking the main thread.
 *
 * The synchronous version above costs three un-yielded passes over the whole
 * board — `toJSON()`, one `JSON.stringify` of the result, and a
 * `CompressionStream` pumped from the main thread (its deflate runs
 * synchronously per chunk on whichever thread pumps it, which is why
 * `service/draftGzip.worker.ts` exists). The server requests a snapshot on a
 * timer, so on a busy lobby that is a multi-hundred-millisecond block landing
 * several times a minute, with nothing in the draw-phase metrics to explain it
 * — see docs/DRAW_ENGINE_HARDENING_PLAN.md → F1.
 *
 * Each stage here already exists for the draft path and is already yielded:
 * `generateChunkedJSON` serializes per object, `documentJsonToBlob` builds the
 * bytes without materializing one giant string, and `gzipBlob` deflates in a
 * worker (falling back inline if workers are unavailable).
 */
export async function createRoomCanvasSnapshotBytes(
	canvas: Canvas,
	signal?: AbortSignal,
): Promise<ArrayBuffer> {
	// Imported lazily, and not only for bundle size: both modules reach the app
	// shell (the router, among others) through their own dependencies, and this
	// module is imported by headless code that has no DOM. A snapshot request
	// arrives a handful of times per session, so the dynamic import costs
	// nothing that matters.
	const [{ documentJsonToBlob, generateChunkedJSON }, { gzipBlob }] =
		await Promise.all([
			import("@/draw/document/serialization"),
			import("@/service/draftSync.service"),
		]);
	const json = await generateChunkedJSON(canvas, signal);
	const blob = await documentJsonToBlob(json, signal);
	const { body } = await gzipBlob(blob);
	return await body.arrayBuffer();
}
