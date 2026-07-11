// src/draw/helpers/drawTileRenderer.helper.ts
import { FabricObject } from "fabric";

export const isolatedTileRenderer = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	obj: FabricObject,
) => {
	const origVisible = obj.visible;
	const origCaching = obj.objectCaching;

	// Force the object to render INTO the tile even if its transient flags would
	// skip it: `visible` can be undefined/false for a beat during a room load
	// (why some lobby objects baked blank), and objectCaching would blit a
	// possibly-empty cache. Both are RESTORED in finally below — a permanent
	// visible=true corrupts object state and can leak content that is meant to
	// stay hidden (e.g. private/claimed areas).
	obj.visible = true;
	obj.objectCaching = false;

	// Do NOT force obj.dirty / clipPath.dirty here. Objects with a ClippingGroup
	// are force-cached by fabric (needsItsOwnCache); forcing dirty made every
	// tile render re-rasterize the whole clip stack — the super-linear erase
	// lag. Real mutations (set(), commitErasing) already flag dirty themselves,
	// so the cache re-renders exactly once per change and is drawImage'd after.

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

		// Restore original states so baking never permanently mutates the object.
		obj.objectCaching = origCaching;
		obj.isOnScreen = origIsOnScreen;
	}
};
