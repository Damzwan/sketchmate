import type { FabricObject } from "fabric";

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

/**
 * Undo journal for one bake, as PARALLEL ARRAYS reused across every call.
 *
 * This used to be a fresh `Array<() => void>` per object per tile, holding one
 * or two closures per node of the object's subtree. A merged Group with 500
 * children spanning 6 tiles therefore allocated ~3,000 closures plus their
 * captured environments in a single bake pass — steady-state garbage on the one
 * device class whose young generation is small enough for that to show up as
 * scavenge frequency (docs/DRAW_ENGINE_MAINTHREAD_REVIEW.md → M6).
 *
 * Three arrays, one entry per touched node, truncated rather than reallocated.
 * Safe as module state because a bake is strictly synchronous between
 * `prepareForBake` and its unwind — `isolatedTileRenderer` never awaits.
 *
 * An entry is EITHER a visibility flip (a culled group child) or a
 * caching/scaling swap, never both, and `undoIsVisibility` is what says which.
 * A separate boolean is required rather than testing the saved value: fabric's
 * `visible` is legitimately `undefined` on some objects, and `undefined` is
 * falsy, so restoring `true` in its place would make a deliberately-hidden
 * object render.
 */
const undoNodes: any[] = [];
const undoCaching: any[] = [];
const undoScaling: any[] = [];
const undoVisible: (boolean | undefined)[] = [];
const undoIsVisibility: boolean[] = [];
let undoCount = 0;

function recordCachingUndo(node: any, caching: any, scaling: any): void {
	undoNodes[undoCount] = node;
	undoCaching[undoCount] = caching;
	undoScaling[undoCount] = scaling;
	undoIsVisibility[undoCount] = false;
	undoCount++;
}

function recordVisibilityUndo(node: any, visible: boolean | undefined): void {
	undoNodes[undoCount] = node;
	undoVisible[undoCount] = visible;
	undoIsVisibility[undoCount] = true;
	undoCount++;
}

function unwindUndo(from: number): void {
	for (let i = undoCount - 1; i >= from; i--) {
		const node = undoNodes[i];
		if (undoIsVisibility[i]) node.visible = undoVisible[i];
		else {
			node.objectCaching = undoCaching[i];
			node.getTotalObjectScaling = undoScaling[i];
		}
		// Drop the references so one big bake cannot keep a whole scene graph (or
		// its captured cache canvases) alive through this journal until a later,
		// larger bake happens to overwrite the slot.
		undoNodes[i] = null;
		undoCaching[i] = null;
		undoScaling[i] = null;
	}
	undoCount = from;
}

function prepareForBake(
	o: any,
	tierScale: number,
	clipRect?: { x: number; y: number; w: number; h: number },
): void {
	const prevCaching = o.objectCaching;
	const prevScaling = o.getTotalObjectScaling;

	o.objectCaching = false;
	o.getTotalObjectScaling = function () {
		return this.getObjectScaling().scalarMultiply(tierScale);
	};

	recordCachingUndo(o, prevCaching, prevScaling);

	// The clipPath — an eraser ClippingGroup — is ALWAYS cached for masking
	// (`renderCache({ forClipping: true })`), at ITS OWN total scaling. During a
	// bake `canvas` is null, so that scaling is object-scale × zoom-1 = 1: the
	// erase MASK rasterizes at 1x and is then upscaled to the tile's tier,
	// blurring every erased edge when zoomed in. Prep the clip (and its stroke
	// children) exactly like the object so the mask bakes at tile resolution.
	// No clipRect — a clip must render whole, never culled.
	const clip = o.clipPath;
	if (
		clip &&
		typeof clip === "object" &&
		typeof clip.getObjectScaling === "function"
	) {
		prepareForBake(clip, tierScale);
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
				// MEASURE ON FRESH COORDS. `getBoundingRect()` reads the CACHED
				// `aCoords`, which fabric computes in the object's PARENT plane and
				// then multiplies by the group matrix. Entering a group rewrites a
				// child's left/top to be group-relative (`applyTransformToObject`)
				// but only refreshes nested coords when `subTargetCheck` is on — it
				// is off. So every child of a freshly built group (a merge) still
				// carries the absolute coords it had as a top-level object, and
				// measuring it returns a phantom rect offset by the group's centre.
				// Every child then failed this test in the tiles it really occupies
				// and the whole merged drawing baked blank — visible only until the
				// first real bake, because the stamp/live paths pass no clipRect and
				// so never cull. Recomputing is idempotent and always correct.
				child.setCoords();
				if (!intersects(clipRect, child.getBoundingRect())) {
					const prevVisible = child.visible;
					child.visible = false;
					recordVisibilityUndo(child, prevVisible);
					continue; // skipped entirely — no need to prep its subtree
				}
			} catch {
				/* un-measurable child: fall through and render it */
			}
		}

		prepareForBake(child, tierScale, clipRect);
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

	// Nested bakes are impossible (this is synchronous), but a clip's own prep
	// runs inside the object's, so the journal is unwound to the depth this call
	// started at rather than to zero.
	const undoMark = undoCount;
	try {
		prepareForBake(obj, tierScale, clipRect);
	} catch (err) {
		// Prep is what makes the render correct; a partial prep must not be left
		// applied to the scene, and the shared journal must not be left holding
		// entries nobody will unwind.
		unwindUndo(undoMark);
		obj.visible = origVisible;
		obj.isOnScreen = origIsOnScreen;
		console.warn("[TileRenderer] Prepare failed:", err);
		return;
	}

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
		unwindUndo(undoMark);
	}
};
