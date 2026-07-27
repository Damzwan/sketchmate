// src/draw/helpers/drawTileRenderer.helper.ts
import { FabricObject } from "fabric";

/**
 * Prepare one object (and, recursively, a group's children) to be rasterized
 * into a tile at `tierScale`, collecting undo closures so the bake never
 * permanently mutates scene state.
 *
 * Two fabric behaviours make this necessary:
 *
 * 1. `objectCaching = false` is NOT enough to stop caching. `shouldCache()` is
 *    `objectCaching && … || needsItsOwnCache()`, and `needsItsOwnCache()` is
 *    true whenever there's a clipPath (every ERASED object). On top of that,
 *    fabric assigns `objectCaching: true` from `ownDefaults` onto every
 *    INSTANCE, so a prototype override is shadowed — and enlivened JSON can
 *    carry the flag straight back in. So it must be cleared per object here.
 *
 * 2. A cache is rasterized at `getTotalObjectScaling()` = objectScale ×
 *    canvas.getZoom(), i.e. the LIVE viewport zoom — never this tile's tier. A
 *    tier-8 tile baked while the user sits at zoom 1 then blits a zoom-1 cache
 *    scaled up 8x. Reporting the tier scale makes `_updateCacheCanvas()` see
 *    `zoomChanged` and regenerate at tile resolution by itself, so we still
 *    avoid force-setting `dirty` (see the erase note below).
 *
 * The recursion matters: a merged drawing is a Group. We used to clear caching
 * on the group only, so its CHILDREN kept caching at the wrong scale — merged
 * art rendered visibly blurrier than the identical ungrouped paths.
 */
function intersects(
	a: { x: number; y: number; w: number; h: number },
	b: { left: number; top: number; width: number; height: number },
): boolean {
	return !(
		b.left + b.width < a.x ||
		b.left > a.x + a.w ||
		b.top + b.height < a.y ||
		b.top > a.y + a.h
	);
}

function prepareForBake(
	o: any,
	tierScale: number,
	undo: Array<() => void>,
	clipRect?: { x: number; y: number; w: number; h: number },
): void {
	const prevCaching = o.objectCaching;
	const prevScaling = o.getTotalObjectScaling;

	o.objectCaching = false;
	o.getTotalObjectScaling = function () {
		return this.getObjectScaling().scalarMultiply(tierScale);
	};

	undo.push(() => {
		o.objectCaching = prevCaching;
		o.getTotalObjectScaling = prevScaling;
	});

	// The clipPath — an eraser ClippingGroup — is ALWAYS cached for masking
	// (`renderCache({ forClipping: true })`), at ITS OWN total scaling. During a
	// bake `canvas` is null, so that scaling is object-scale × zoom-1 = 1: the
	// erase MASK rasterizes at 1x and is then upscaled to the tile's tier,
	// blurring every erased edge when zoomed in. Prep the clip (and its stroke
	// children) exactly like the object so the mask bakes at tile resolution.
	// No clipRect — a clip must render whole, never culled.
	const clip = o.clipPath;
	if (clip && typeof clip === "object" && typeof clip.getObjectScaling === "function") {
		prepareForBake(clip, tierScale, undo);
	}

	if (!Array.isArray(o._objects)) return;

	for (let i = 0; i < o._objects.length; i++) {
		const child = o._objects[i];

		// CULLING: a merged Group is a SINGLE quadtree entry covering the union of
		// its children, so every tile overlapping that union gets the whole group
		// and would render every child. Fabric won't cull them either — render()'s
		// offscreen skip is bypassed for objects that have a parent group, and in
		// the bake worker `canvas` is null so there is no cull at all. Result:
		// children × tiles renders instead of children. Flag out-of-tile children
		// invisible; render() bails on `visible` before doing any path work.
		if (clipRect) {
			try {
				if (!intersects(clipRect, child.getBoundingRect())) {
					const prevVisible = child.visible;
					child.visible = false;
					undo.push(() => {
						child.visible = prevVisible;
					});
					continue; // skipped entirely — no need to prep its subtree
				}
			} catch {
				/* un-measurable child: fall through and render it */
			}
		}

		prepareForBake(child, tierScale, undo, clipRect);
	}
}

export const isolatedTileRenderer = (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	obj: FabricObject,
	tierScale = 1,
	clipRect?: { x: number; y: number; w: number; h: number },
) => {
	const origVisible = obj.visible;

	// Force the object to render INTO the tile even if its transient flags would
	// skip it: `visible` can be undefined/false for a beat during a room load
	// (why some lobby objects baked blank). RESTORED in finally below — a
	// permanent visible=true corrupts object state and can leak content that is
	// meant to stay hidden (e.g. private/claimed areas).
	obj.visible = true;

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

	const undo: Array<() => void> = [];
	prepareForBake(obj, tierScale, undo, clipRect);

	ctx.save();
	try {
		obj.render(ctx as CanvasRenderingContext2D);
	} catch (err) {
		console.warn("[TileRenderer] Draw failed:", err);
	} finally {
		ctx.restore();

		// Restore original states so baking never permanently mutates the object.
		obj.visible = origVisible;
		obj.isOnScreen = origIsOnScreen;
		for (let i = undo.length - 1; i >= 0; i--) undo[i]();
	}
};
