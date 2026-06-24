// src/draw/helpers/drawTileRenderer.helper.ts
import { FabricObject } from "fabric";

export const isolatedTileRenderer = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	obj: FabricObject,
) => {
	if (obj.visible === false || obj.opacity === 0) return false;


	const origCaching = obj.objectCaching;
	obj.objectCaching = false;
	obj.dirty = true;

	if (obj.clipPath) {
		obj.clipPath.dirty = true;
	}

	// THE FIX: Since we kept obj.canvas attached, Fabric will attempt to cull
	// the object if it is off-screen relative to the MAIN canvas viewport.
	// Because we are baking background tiles, we must forcefully bypass this!
	const origIsOnScreen = obj.isOnScreen;
	obj.isOnScreen = () => true;

	ctx.save();
	try {
		obj.render(ctx as CanvasRenderingContext2D);
	} catch (err) {
		console.warn("[TileRenderer] Draw failed:", err);
	} finally {
		ctx.restore();

		// Restore original states so the live layer behaves normally
		obj.objectCaching = origCaching;
		obj.isOnScreen = origIsOnScreen;
	}
};