import { FabricObject } from "fabric";

export const isolatedTileRenderer = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	obj: FabricObject,
) => {
	if (obj.visible === false || obj.opacity === 0) return false;

	const originalCanvas = obj.canvas;
	// @ts-ignore — fabric typings don't allow null but the runtime accepts it
	obj.canvas = null;
	obj.objectCaching = false;
	obj.dirty = true;
	if (obj.clipPath) obj.clipPath.dirty = true;

	ctx.save();
	try {
		obj.render(ctx as CanvasRenderingContext2D);
	} catch (err) {
		console.warn("[TileRenderer] Draw failed:", err);
	} finally {
		ctx.restore();
		// @ts-ignore
		obj.canvas = originalCanvas;
	}
};
