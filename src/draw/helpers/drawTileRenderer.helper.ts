import { FabricObject } from "fabric";

export const isolatedTileRenderer = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	obj: FabricObject,
) => {
	if (obj.visible === false || obj.opacity === 0) return false;

	// Snapshot everything we're about to mutate.
	const originalCanvas = obj.canvas;
	const wasCached = obj.objectCaching;

	// Detach from the live canvas so fabric internals (filter pipelines,
	// dirty-flag propagation, etc.) don't reach back into it during the bake.
	// @ts-ignore — fabric typings don't allow null but the runtime accepts it
	obj.canvas = null;

	// Don't allocate a private per-object bitmap cache while we're baking it
	// into a tile — that's a double cache.
	obj.objectCaching = false;

	// Make sure fabric re-renders rather than returning a stale internal cache
	// that pre-dates the latest commit (e.g. eraser commit).
	obj.dirty = true;
	if (obj.clipPath) {
		obj.clipPath.dirty = true;
	}

	ctx.save();
	try {
		obj.render(ctx as CanvasRenderingContext2D);
	} catch (err) {
		console.warn("[TileRenderer Isolation Override] Draw failed:", err);
	} finally {
		ctx.restore();
		// @ts-ignore — restore the original canvas reference
		obj.canvas = originalCanvas;
	}
};
