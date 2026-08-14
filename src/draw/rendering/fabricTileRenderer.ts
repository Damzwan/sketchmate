import type { FabricObject } from "fabric";
import {
	IS_LOW_END_DEVICE,
	IS_MOBILE_DEVICE,
} from "@/draw/config/renderQuality.config";
import { shouldTimeRenderObject } from "@/draw/rendering/renderMetrics";

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

/**
 * The tier every `bakeScaling` call reports, as module state.
 *
 * `getTotalObjectScaling` used to be assigned as a fresh arrow capturing
 * `tierScale`, which means ONE CLOSURE PER NODE PER TILE. A dense board hands a
 * single tile a few thousand objects and a bake pass covers ~40 tiles, so that
 * was tens of thousands of closures (plus their captured environments) per pass
 * — the same steady-state garbage the undo journal was rewritten to avoid, on
 * the device class least able to absorb it.
 *
 * Safe as module state precisely because it is only ever read INSIDE the
 * synchronous window between a `prepareForBake` and its unwind: fabric calls
 * `getTotalObjectScaling` from `render()`, and no bake path awaits between the
 * two. Concurrent bake lanes share one tier per pass anyway.
 */
let bakeTierScale = 1;

function bakeScaling(this: any) {
	return this.getObjectScaling().scalarMultiply(bakeTierScale);
}

function prepareForBake(
	o: any,
	tierScale: number,
	clipRect?: { x: number; y: number; w: number; h: number },
): void {
	const prevCaching = o.objectCaching;
	const prevScaling = o.getTotalObjectScaling;

	bakeTierScale = tierScale;
	o.objectCaching = false;
	o.getTotalObjectScaling = bakeScaling;

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

/**
 * Below this a group is cheap enough that splitting it costs more in ceremony
 * than the block it would break up. A merge of a handful of shapes renders in
 * well under a frame; a merge of a whole drawing does not.
 */
const SPLITTABLE_GROUP_MIN_CHILDREN = IS_LOW_END_DEVICE
	? 16
	: IS_MOBILE_DEVICE
		? 32
		: 48;

export interface RenderYielder {
	shouldYield(): boolean;
	yield(): Promise<void>;
}

/**
 * Can this object's render be broken into pieces the caller can yield between?
 *
 * Only a plain container qualifies. A clipPath (an erased group) or a
 * force-cached object has to rasterize as ONE unit through fabric's own cache
 * path, and reproducing that here would be reimplementing fabric.
 */
export function isSplittableForBake(obj: FabricObject): boolean {
	const o = obj as any;
	return (
		Array.isArray(o._objects) &&
		o._objects.length >= SPLITTABLE_GROUP_MIN_CHILDREN &&
		!o.clipPath &&
		// Top level only. `transform()` picks own-vs-full matrix from the PARENT's
		// `_transformDone`, so applying it by hand for a nested group would need to
		// reproduce that state too. A merged group inside a group falls back to the
		// sync path, which is correct, just not interruptible.
		!o.group &&
		typeof o.transform === "function" &&
		typeof o.needsItsOwnCache === "function" &&
		!o.needsItsOwnCache()
	);
}

/**
 * Yielding counterpart of `isolatedTileRenderer` for MERGED art.
 *
 * A merged drawing is one Group, and `group.render()` is a single synchronous
 * call that rasterizes every child. The bake loop yields between OBJECTS, so a
 * group holding a whole drawing is one indivisible block on the main thread —
 * exactly the object the local fallback is most likely to be handed, and the
 * longest frame in the app.
 *
 * This performs the render fabric would (`Object.render` → `Group.drawObject`)
 * with the child loop opened up, so the caller can yield between batches.
 *
 * Deliberately reuses `isolatedTileRenderer` per child rather than preparing the
 * whole subtree up front. Each child call is self-contained and SYNCHRONOUS: it
 * prepares, renders and fully restores before returning, so no scene mutation is
 * ever left applied across an await where a concurrent bake lane could observe
 * (or clobber) it. That property is what makes this safe to make async at all.
 */
export const renderSplitForBake = async (
	ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
	obj: FabricObject,
	tierScale: number,
	clipRect: { x: number; y: number; w: number; h: number } | undefined,
	yielder: RenderYielder,
	isAborted?: () => boolean,
	onObjectRendered?: (ms: number, obj: FabricObject) => void,
): Promise<void> => {
	const group = obj as any;
	const children: any[] = group._objects;

	const origVisible = group.visible;
	const origIsOnScreen = group.isOnScreen;
	const origTransformDone = group._transformDone;
	group.visible = true;
	group.isOnScreen = () => true;

	ctx.save();
	try {
		// The state fabric's own `render` establishes around `drawObject`.
		group._setupCompositeOperation?.(ctx);
		group.transform(ctx);
		// What `Group.render` sets before delegating: it tells each child's
		// `transform()` to use its OWN matrix, because the group's is already on the
		// context. Without it every child re-applies the group matrix on top of it.
		group._transformDone = true;
		group._setOpacity?.(ctx);
		group._setShadow?.(ctx);
		group._renderBackground?.(ctx);

		for (let i = 0; i < children.length; i++) {
			const child = children[i];
			if (!child) continue;
			// Same cull as the sync path, and for the same reason: the group is ONE
			// index entry, so every tile it overlaps is handed all of its children.
			if (clipRect) {
				try {
					child.setCoords();
					if (!intersects(clipRect, child.getBoundingRect())) continue;
				} catch {
					/* un-measurable child: render it */
				}
			}
			const timed = !onObjectRendered || shouldTimeRenderObject();
			const renderStartedAt = timed ? performance.now() : 0;
			isolatedTileRenderer(
				ctx as CanvasRenderingContext2D,
				child,
				tierScale,
				clipRect,
			);
			if (timed) onObjectRendered?.(performance.now() - renderStartedAt, child);
			if ((i & 15) === 15 || yielder.shouldYield()) {
				await yielder.yield();
				// A stale tile is dropped by the caller's generation check, so leaving
				// the group half-drawn here is safe — it is never stored.
				if (isAborted?.()) return;
			}
		}
	} catch (err) {
		console.warn("[TileRenderer] Split draw failed:", err);
	} finally {
		ctx.restore();
		group._transformDone = origTransformDone;
		group.visible = origVisible;
		group.isOnScreen = origIsOnScreen;
	}
};

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
