// src/draw/helpers/drawTileRenderer.helper.ts
import { FabricObject } from "fabric";

export const isolatedTileRenderer = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	obj: FabricObject,
) => {
	if (obj.visible === false || obj.opacity === 0) return false;

	ctx.save();

	// 1. Force absolute isolation from its parent canvas properties during this thread
	const originalCanvas = obj.canvas;
	// @ts-ignore
	obj.canvas = null;

	// 2. Clear caching references on the fly
	const wasCached = obj.objectCaching;
	obj.objectCaching = false;
	obj.dirty = true;

	try {
		// 3. Compute and apply the object's specific transform matrix manually
		if (typeof (obj as any).calcTransformMatrix === "function") {
			const matrix = (obj as any).calcTransformMatrix();
			ctx.transform(
				matrix[0],
				matrix[1],
				matrix[2],
				matrix[3],
				matrix[4],
				matrix[5],
			);
		} else {
			ctx.translate(obj.left, obj.top);
			ctx.rotate((obj.angle * Math.PI) / 180);
			ctx.scale(obj.scaleX, obj.scaleY);
		}

		// 4. Draw the RAW vector geometry paths directly onto the context
		if ((obj as any)._render) {
			(obj as any)._render(ctx);
		} else {
			obj.render(ctx as any);
		}
	} catch (err) {
		console.warn("[TileRenderer Isolation Override] Draw failed:", err);
	} finally {
		// 5. Restore original states safely
		obj.objectCaching = wasCached;
		// @ts-ignore
		obj.canvas = originalCanvas;
		ctx.restore();
	}
};
