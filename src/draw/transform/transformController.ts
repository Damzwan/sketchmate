import { Canvas, FabricObject, InteractiveFabricObject } from "fabric";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { compareRenderOrder } from "@/draw/layers/layerRegistry";
import { useGestureStore } from "@/draw/tools/gesture.store";
import { getRenderDpr } from "@/draw/config/renderQuality.config";
import { DRAW_MEMORY_PROFILE } from "@/draw/config/drawMemory.config";
import { fitBitmapDimensions } from "@/draw/config/drawMemoryProfile";
import { recordPhase } from "@/draw/rendering/renderMetrics";
import {
	bakeryRenderSelection,
	isBakeryActive,
} from "@/draw/rendering/bakery/tileBakeryClient";
import { isolatedTileRenderer } from "@/draw/rendering/fabricTileRenderer";
import {
	rectangularHoleClipPath,
	snapRectToDevicePixels,
} from "@/draw/transform/vacatedLayerMask";
import { paintVacatedLayer } from "@/draw/transform/vacatedLayerPainter";

interface Refs {
	left: number;
	top: number;
	scaleX: number;
	scaleY: number;
	angle: number;
}

interface Origin {
	left: number;
	top: number;
	width: number;
	height: number;
}

interface Session {
	canvas: Canvas;
	objects: FabricObject[];
	target: FabricObject;
	savedOpacity: number[];
	bitmap: ImageBitmap;
	origin: Origin;
	refs: Refs;
	/** Transform at beginNew — the state the quadtree entries reflect. Never
	 *  touched by rebaseline, so commit's translation fast-path stays exact. */
	origRefs: Refs;
	baseZoom: number;
	moveHappened: boolean;
	rafId: number | null;
	/** Sharp rendering of the old footprint without the selected objects. */
	vacatedBitmap: ImageBitmap | null;
	vacatedPromise: Promise<void> | null;
	oldRegionRetained: boolean;
	releasePending: boolean;
}

interface CachedBake {
	bitmap: ImageBitmap;
	origin: Origin;
	state: {
		id: string | null; // selection identity — two targets can share shape+zoom
		scaleX: number;
		scaleY: number;
		angle: number;
		width: number;
		height: number;
		zoom: number;
		/** Baked at reduced resolution for a fast mouse:down — an idle prewarm
		 *  replaces it with a full-quality bake. */
		lowQuality: boolean;
	};
}

interface CachedVacated {
	bitmap: ImageBitmap;
	origin: Origin;
	state: {
		id: string | null;
		left: number;
		top: number;
		scaleX: number;
		scaleY: number;
		angle: number;
		width: number;
		height: number;
		zoom: number;
	};
}

let session: Session | null = null;
let cachedBake: CachedBake | null = null;
let cachedVacated: CachedVacated | null = null;
const ownedIds = new Set<string>();

// Reused DOM layers: the fixed background patch sits below the moving bitmap.
let layerCanvas: HTMLCanvasElement | null = null;
let vacatedLayerCanvas: HTMLCanvasElement | null = null;
let maskedLowerCanvas: {
	element: HTMLCanvasElement;
	clipPath: string;
	webkitClipPath: string;
} | null = null;

// ─── Public API ──────────────────────────────────────────────────────────────

export function isActive(): boolean {
	return session !== null;
}

export function moveHappened(): boolean {
	return session?.moveHappened ?? false;
}

export function activeObjects(): readonly FabricObject[] {
	return session?.objects ?? [];
}

export function activeTranslationDelta(): { x: number; y: number } | null {
	if (!session?.moveHappened) return null;
	const target = session.target;
	if (
		(target.scaleX ?? 1) !== session.origRefs.scaleX ||
		(target.scaleY ?? 1) !== session.origRefs.scaleY ||
		(target.angle ?? 0) !== session.origRefs.angle
	) {
		return null;
	}
	return {
		x: (target.left ?? 0) - session.origRefs.left,
		y: (target.top ?? 0) - session.origRefs.top,
	};
}

/** True while the controller "owns" this object (manager skips its tile patches
 *  until commit AND through the post-commit bake, via persisted ownedIds). */
export function ownsObject(id: string): boolean {
	return ownedIds.has(id);
}

export function ownsTarget(obj: FabricObject): boolean {
	if (session && obj === session.target) return true;
	const id = (obj as any).id;
	return !!id && ownedIds.has(id);
}

/** Called on mouse:down on a target. Reuses the current session if the same
 *  selection is being grabbed again (no re-bake, no re-punch). */
export function beginOrContinue(c: Canvas, target: FabricObject): void {
	const objs = isActiveSelection(target)
		? [...(target as any)._objects]
		: [target];

	if (session) {
		if (sameSet(session.objects, objs)) {
			session.target = target;
			const zoom = c.viewportTransform![0];
			if (Math.abs(zoom - session.baseZoom) > 1e-4) rebaseline(c, session);
			return;
		}
		commit(c); // different selection → flush the old one first
	}
	beginNew(c, target, objs);
}

/** First frame the user actually moves: hide originals and reveal the prepared
 * background plus the independently moving selection layer. */
export function markMoved(): void {
	if (!session || session.moveHappened) return;
	session.moveHappened = true;
	const s = session;
	const mgr = useDrawObjectManager();
	mgr.onTransformStart();

	s.objects.forEach((o) => (o.opacity = 0));

	const repairStartedAt = performance.now();
	if (s.vacatedBitmap) {
		activatePreparedCover(s, mgr);
	}
	recordPhase(
		"selectionTransformOldRegion",
		performance.now() - repairStartedAt,
	);

	// A cold mobile selection stays at its sharp committed position until the
	// exact background cover is ready. Showing the moving layer sooner would
	// duplicate the object; invalidating sooner would expose the overview.
	if (s.vacatedBitmap) applyTransform(s);
	renderControls(s.canvas);
}

/** Coalesced per-frame update — just a GPU transform write + cheap controls. */
export function schedule(): void {
	if (!session) return;
	if (session.rafId !== null) return;
	session.rafId = requestAnimationFrame(() => {
		if (!session) return;
		session.rafId = null;
		applyTransform(session);
		renderControls(session.canvas);
	});
}

/** Finish one drag and commit its bitmap-backed result to the tile layer. */
export function releaseDrag(c: Canvas): void {
	if (!session) return;
	const startedAt = performance.now();
	const s = session;
	if (s.rafId !== null) {
		cancelAnimationFrame(s.rafId);
		s.rafId = null;
	}
	if (s.moveHappened) {
		applyTransform(s);
		renderControls(c);
	}
	if (s.moveHappened && !s.vacatedBitmap && s.vacatedPromise) {
		if (s.releasePending) return;
		s.releasePending = true;
		void s.vacatedPromise.finally(() => {
			if (session !== s) return;
			s.vacatedPromise = null;
			s.releasePending = false;
			releaseDrag(c);
		});
		return;
	}
	// commit() performs the setCoords + quadtree refresh — doing it here as
	// well ran the whole O(N) loop twice per release.
	commit(c);
	recordPhase("selectionTransformCommit", performance.now() - startedAt);
}

/** The selection is really finished with. Repaint tiles ONCE and tear down. */
export function commit(c: Canvas): void {
	if (!session) return;
	const s = session;
	session = null;
	// DO NOT clear ownedIds here — let ownership persist through the bake so the
	// manager keeps skipping this object's own modified-events until tiles land.
	if (s.rafId !== null) cancelAnimationFrame(s.rafId);

	const el = layerCanvas;

	if (s.moveHappened) {
		const mgr = useDrawObjectManager();
		const layoutStartedAt = performance.now();
		const oldRect = sessionOriginRect(s);

		// 1. Refresh layout FIRST so the quadtree has the NEW position before we
		//    invalidate (otherwise the old-region drop could re-capture the object).
		//    Pure translation (the common heavy case) shifts every child's world
		//    bounds by the same delta — exact, no per-child transform-chain math.
		const dx = (s.target.left ?? 0) - s.origRefs.left;
		const dy = (s.target.top ?? 0) - s.origRefs.top;
		const pureMove =
			(s.target.scaleX ?? 1) === s.origRefs.scaleX &&
			(s.target.scaleY ?? 1) === s.origRefs.scaleY &&
			(s.target.angle ?? 0) === s.origRefs.angle;

		// ActiveSelection's Group override recalculates every child's coordinates.
		// A pure translation changes only the wrapper transform; each child's local
		// coordinates stay identical and get transformed by the group at read time.
		if (pureMove && isActiveSelection(s.target)) {
			FabricObject.prototype.setCoords.call(s.target);
		} else {
			s.target.setCoords();
		}
		if (pureMove) {
			// A directly-grabbed single object IS its own session.target, so fabric's
			// object:modified (fired on mouse:up, BEFORE this commit) already moved
			// its quadtree entry to the new absolute position via the owned branch of
			// onObjectModified. offsetQuadTree would then shift that already-moved
			// entry by (dx,dy) AGAIN → the bake queries the wrong tiles and the object
			// vanishes / partly shows. Recompute absolutely instead — idempotent, and
			// cheap for one object. A multi-object selection is NOT indexed itself, so
			// its children were never pre-shifted and the offset fast-path stays exact.
			const single = s.objects.length === 1;
			for (const o of s.objects) {
				if (single) mgr.updateQuadTree(o);
				else if (dx !== 0 || dy !== 0) mgr.offsetQuadTree(o, dx, dy);
			}
			// Move the worker mirror in ONE batched message (multi-select only; the
			// single-object path already resynced via updateQuadTree above).
			if (!single && (dx !== 0 || dy !== 0))
				mgr.translateMirror(s.objects, dx, dy);
		} else {
			for (const o of s.objects) {
				mgr.updateQuadTree(o);
			}
		}
		recordPhase(
			"selectionTransformLayout",
			performance.now() - layoutStartedAt,
		);

		// 2. The old footprint was already repaired at drag start while these
		// objects were hidden. Invalidating it again here would throw that sharp
		// background away and expose the overview for a bake round-trip.
		// Tile bakes can now see the objects at their committed position.
		s.objects.forEach((o, i) => (o.opacity = s.savedOpacity[i]));

		// END THE GESTURE HERE, not at the bottom of commit.
		//
		// Everything below invalidates: the old footprint, the new one, or both.
		// While `gesturing` is true the engine refuses the synchronous repair that
		// goes with an invalidation AND refuses to schedule a bake, so the whole
		// moved region dropped to the overview and stayed there until the gesture
		// flag cleared and a debounced bake finally landed — the low-res patch that
		// follows a drag around. With the gesture closed first, each invalidation
		// below repairs its own visible footprint in the same task.
		//
		// It must come AFTER the opacity restore directly above: a repair renders
		// these objects from the index, and at opacity 0 it would bake them out.
		mgr.onTransformEnd();

		if (!s.oldRegionRetained) {
			// Only an actual preparation failure reaches this compatibility path.
			// Repair after the index moved so the old footprint cannot recapture the
			// selected objects at their former position.
			mgr.dropRegionLight(oldRect, false, false, 6, true);
		}

		const tb = s.target.getBoundingRect();
		const PAD = 8;
		const newRect = {
			x: tb.left - PAD,
			y: tb.top - PAD,
			w: tb.width + PAD * 2,
			h: tb.height + PAD * 2,
		};

		// 4. Stamp the drag-layer pixels straight into the tiles at the new
		//    position: the commit costs O(touched tiles) drawImage instead of
		//    re-rendering N objects, and the result is pixel-identical to what
		//    the layer already shows. Tiles are stored stale-but-USABLE — the
		//    scheduled bake repaints them exactly (correct z where the selection
		//    sits under other content) without any visible change.
		//
		// NB: this MUST come before any invalidation of `newRect`. A
		// scheduleRectPatch(newRect) used to run here first, which bumped the
		// generation of every tile the stamp was about to write — so
		// stampBitmapRegion found all of them stale, skipped all of them, and the
		// fast path never executed once. The engine now grows content bounds and
		// patches the overview inside stampRegionBitmap, and tiles the stamp could
		// NOT cover are invalidated by the stamp itself, so nothing is lost.
		let stamped = false;
		let attempted = false;
		const stampStartedAt = performance.now();
		const hasVacatedPatch = !!s.vacatedBitmap;
		if (hasVacatedPatch) {
			// The old footprint was deliberately retained and is therefore stale.
			// Old/new positions commonly share a tile, so trying to stamp here would
			// reject that tile and partially invalidate the exact cover we already
			// have. Retain the sharp background at the new position as well; the CSS
			// selection supplies the only missing pixels until both regions rebake.
			attempted = true;
			mgr.retainRegionsUntilRebaked([newRect]);
		} else if (c.viewportTransform![0] === s.baseZoom) {
			try {
				attempted = true;
				stamped = mgr.stampRegionBitmap(
					newRect,
					s.bitmap,
					bitmapToWorldMatrix(s),
				);
			} catch {
				// bitmap closed / detached, possibly mid-region — fall back to the
				// ordinary invalidate so nothing is left half-written.
				attempted = false;
			}
		}
		// 5. The stamp did not run at all (zoom changed mid-drag, bitmap gone) → the
		//    ordinary invalidate + bake path owns the new footprint. A stamp that
		//    RAN needs nothing here: it invalidated whatever it could not cover and
		//    scheduled the bake itself, and re-invalidating would just undo the
		//    tiles it did cover.
		if (!attempted) mgr.scheduleRectPatch(newRect);
		recordPhase("selectionTransformStamp", performance.now() - stampStartedAt);

		const elRef = el;
		const idsToClear = new Set(ownedIds);

		if (stamped && !hasVacatedPatch) {
			// Tiles already show the exact layer pixels — hide immediately.
			if (elRef) elRef.style.display = "none";
			idsToClear.forEach((id) => ownedIds.delete(id));
			renderControls(c);
		} else {
			// Keep both CSS layers until every region they cover has a sharp tile.
			// This is especially important when old/new footprints overlap: hiding
			// the moving layer first would let the fixed background patch cover the
			// object at its new position.
			const hideWhenReady = () => {
				if (session) return; // a new drag took over the layer

				const currentZoom = c.viewportTransform![0];
				const oldReady = !hasVacatedPatch || mgr.isRegionBaked(oldRect);
				const newReady = stamped || mgr.isRegionBaked(newRect);
				if (currentZoom !== s.baseZoom || (oldReady && newReady)) {
					if (elRef) elRef.style.display = "none";
					hideVacatedLayer();
					idsToClear.forEach((id) => ownedIds.delete(id));
					renderControls(c);
				} else {
					requestAnimationFrame(hideWhenReady);
				}
			};
			requestAnimationFrame(hideWhenReady);
		}
	} else {
		if (el) el.style.display = "none";
		hideVacatedLayer();
		s.target.setCoords();
		ownedIds.clear();
		renderControls(c);
	}

	// Upgrade / refresh the bake cache during idle so the NEXT grab of this
	// selection is instant: converts a fast low-quality bake to full quality,
	// and re-bakes after rotate/scale (which changed the cache key).
	prewarm(c);
}

export function cancel(c: Canvas): void {
	commit(c);
}

export function invalidateCache(): void {
	prewarmGeneration++;
	if (cachedBake?.bitmap) cachedBake.bitmap.close();
	cachedBake = null;
	invalidateVacatedCache();
}

/** Any scene change inside the old footprint makes its prepared background stale. */
export function invalidateVacatedCache(): void {
	vacatedGeneration++;
	if (cachedVacated?.bitmap) cachedVacated.bitmap.close();
	cachedVacated = null;
}

// ─── idle prewarm ────────────────────────────────────────────────────────────

const requestIdle: (cb: () => void, timeout: number) => number =
	typeof (window as any).requestIdleCallback === "function"
		? (cb, timeout) => (window as any).requestIdleCallback(cb, { timeout })
		: (cb, timeout) => window.setTimeout(cb, Math.min(timeout, 200));
const cancelIdle: (h: number) => void =
	typeof (window as any).cancelIdleCallback === "function"
		? (h) => (window as any).cancelIdleCallback(h)
		: (h) => clearTimeout(h);

let prewarmHandle: number | null = null;
let prewarmGeneration = 0;
let prewarmPromise: Promise<void> | null = null;
let vacatedHandle: number | null = null;
let vacatedGeneration = 0;

/**
 * Bake (or upgrade a low-quality bake of) the CURRENT active object's
 * selection bitmap during idle time, so the next mouse:down grab is a cache
 * hit instead of a synchronous N-object render. Safe to call often — a hot
 * full-quality cache makes it a no-op.
 */
export function prewarm(c: Canvas): void {
	if (prewarmHandle !== null) cancelIdle(prewarmHandle);
	const target = c.getActiveObject();
	if (target) prewarmVacated(c, target);
	if (target && cachedBakeMatches(target, c.viewportTransform![0], false)) {
		return;
	}
	const childCount =
		target && isActiveSelection(target)
			? ((target as any)._objects?.length ?? 0)
			: 0;
	if (target && childCount > FAST_BAKE_MIN_CHILDREN) {
		const generation = ++prewarmGeneration;
		const pending = bakeSelectionBitmapInWorker(c, target, generation);
		prewarmPromise = pending;
		void pending.finally(() => {
			if (prewarmPromise === pending) prewarmPromise = null;
		});
		return;
	}
	prewarmHandle = requestIdle(() => {
		prewarmHandle = null;
		if (session) return; // a live drag owns the selection; commit re-prewarms
		if (useGestureStore().isGesturing) {
			// Mid-pinch: zoom is still changing, a bake now would key on a
			// transient zoom AND jank the gesture. Try again shortly.
			prewarm(c);
			return;
		}
		const target = c.getActiveObject();
		if (!target) return;
		bakeSelectionBitmap(c, target);
	}, 500);
}

/**
 * Prepare the pixels that become visible when the selection leaves its old
 * footprint. This turns drag start into two CSS-layer reveals instead of a
 * synchronous tile reconstruction whose 6 ms budget is unreliable on mobile.
 */
function prewarmVacated(c: Canvas, target: FabricObject): void {
	if (cachedVacatedMatches(target, c.viewportTransform![0])) return;
	if (vacatedHandle !== null) cancelIdle(vacatedHandle);
	const generation = ++vacatedGeneration;
	if (isBakeryActive()) {
		// Querying IDs and posting the request are cheap; start immediately so a
		// phone does not need an idle gap between selecting and dragging.
		void bakeVacatedBitmap(c, target, generation);
		return;
	}

	vacatedHandle = requestIdle(() => {
		vacatedHandle = null;
		if (
			session ||
			generation !== vacatedGeneration ||
			c.getActiveObject() !== target
		) {
			return;
		}
		if (useGestureStore().isGesturing) {
			prewarmVacated(c, target);
			return;
		}
		void bakeVacatedBitmap(c, target, generation);
	}, 350);
}

async function bakeVacatedBitmap(
	c: Canvas,
	target: FabricObject,
	generation: number,
): Promise<void> {
	const { origin, width, height } = bitmapGeometry(c, target);
	if (width <= 0 || height <= 0) return;

	const backgroundObjects = vacatedObjects(target, origin);

	let bitmap = backgroundObjects.length
		? await bakeryRenderSelection(
				backgroundObjects,
				{
					x: origin.left,
					y: origin.top,
					w: origin.width,
					h: origin.height,
				},
				width,
				height,
			)
		: transparentBitmap();
	if (
		generation !== vacatedGeneration ||
		session ||
		c.getActiveObject() !== target
	) {
		bitmap?.close();
		return;
	}
	if (!bitmap) {
		bitmap = await renderVacatedLocally(
			backgroundObjects,
			origin,
			width,
			height,
			() =>
				generation !== vacatedGeneration ||
				!!session ||
				c.getActiveObject() !== target,
		);
	}
	if (!bitmap) return;
	if (
		generation !== vacatedGeneration ||
		session ||
		c.getActiveObject() !== target
	) {
		bitmap.close();
		return;
	}

	cachedVacated?.bitmap.close();
	cachedVacated = {
		bitmap,
		origin,
		state: vacatedState(target, c.viewportTransform![0]),
	};
}

/** Urgent cold-start preparation owned by a live transform session. Unlike the
 * idle cache warmer, this is allowed to finish while the session is active. */
async function prepareVacatedForSession(s: Session): Promise<void> {
	const origin = s.origin;
	const scale = s.baseZoom * getRenderDpr();
	let width = Math.ceil(origin.width * scale);
	let height = Math.ceil(origin.height * scale);
	({ width, height } = fitTransformBitmap(width, height));
	if (width <= 0 || height <= 0) return;

	const backgroundObjects = vacatedObjects(s.target, origin);
	let bitmap = backgroundObjects.length
		? await bakeryRenderSelection(
				backgroundObjects,
				originRect(origin),
				width,
				height,
			)
		: transparentBitmap();
	if (session !== s) {
		bitmap?.close();
		return;
	}
	if (!bitmap) {
		bitmap = await renderVacatedLocally(
			backgroundObjects,
			origin,
			width,
			height,
			() => session !== s,
		);
	}
	if (!bitmap || session !== s) {
		bitmap?.close();
		return;
	}

	cachedVacated?.bitmap.close();
	cachedVacated = {
		bitmap,
		origin,
		state: {
			id: ((s.target as any).id as string | undefined) ?? null,
			left: s.refs.left,
			top: s.refs.top,
			scaleX: s.refs.scaleX,
			scaleY: s.refs.scaleY,
			angle: s.refs.angle,
			width: s.target.width ?? 0,
			height: s.target.height ?? 0,
			zoom: s.baseZoom,
		},
	};
	s.vacatedBitmap = bitmap;
	placeVacatedLayer(s.canvas, s);
	if (s.moveHappened) activatePreparedCover(s);
}

async function renderVacatedLocally(
	objects: FabricObject[],
	origin: Origin,
	width: number,
	height: number,
	isCancelled: () => boolean,
): Promise<ImageBitmap | null> {
	const off = new OffscreenCanvas(width, height);
	const ctx = off.getContext("2d", { alpha: true });
	if (!ctx) return null;
	const scale = Math.min(width / origin.width, height / origin.height);
	ctx.scale(scale, scale);
	ctx.translate(-origin.left, -origin.top);
	const rect = {
		x: origin.left,
		y: origin.top,
		w: origin.width,
		h: origin.height,
	};
	let sliceStartedAt = performance.now();
	for (const object of objects) {
		if (isCancelled()) return null;
		isolatedTileRenderer(ctx, object, scale, rect);
		if (performance.now() - sliceStartedAt < 4) continue;
		await nextFrame();
		sliceStartedAt = performance.now();
	}
	if (isCancelled()) return null;
	try {
		return off.transferToImageBitmap();
	} catch {
		return null;
	}
}

function nextFrame(): Promise<void> {
	return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function bakeSelectionBitmapInWorker(
	c: Canvas,
	target: FabricObject,
	generation: number,
): Promise<void> {
	const PAD = 8;
	const b = target.getBoundingRect();
	const zoom = c.viewportTransform![0];
	const objects = [...((target as any)._objects ?? [])] as FabricObject[];
	if (!objects.length || b.width <= 0 || b.height <= 0) return;

	const minX = b.left - PAD;
	const minY = b.top - PAD;
	const worldW = b.width + PAD * 2;
	const worldH = b.height + PAD * 2;
	let scale = zoom * getRenderDpr();
	if (objects.length > 150) scale *= 0.5;
	else if (objects.length > 50) scale *= 0.75;

	let physW = Math.ceil(worldW * scale);
	let physH = Math.ceil(worldH * scale);
	const MAX_DIM = 2048;
	if (physW > MAX_DIM || physH > MAX_DIM) {
		const factor = Math.min(MAX_DIM / physW, MAX_DIM / physH);
		physW = Math.max(1, Math.floor(physW * factor));
		physH = Math.max(1, Math.floor(physH * factor));
	}

	const bitmap = await bakeryRenderSelection(
		objects,
		{ x: minX, y: minY, w: worldW, h: worldH },
		physW,
		physH,
	);
	if (!bitmap) return;
	if (
		generation !== prewarmGeneration ||
		session ||
		c.getActiveObject() !== target
	) {
		bitmap.close();
		return;
	}

	cachedBake?.bitmap.close();
	cachedBake = {
		bitmap,
		origin: { left: minX, top: minY, width: worldW, height: worldH },
		state: {
			id: ((target as any).id as string | undefined) ?? null,
			scaleX: target.scaleX ?? 1,
			scaleY: target.scaleY ?? 1,
			angle: target.angle ?? 0,
			width: target.width ?? 0,
			height: target.height ?? 0,
			zoom,
			lowQuality: false,
		},
	};
}

// ─── Session setup ───────────────────────────────────────────────────────────

function beginNew(c: Canvas, target: FabricObject, objs: FabricObject[]): void {
	// No unconditional invalidateCache here — bakeSelectionBitmap validates the
	// cache against identity + shape + zoom, so re-grabbing an unchanged
	// selection is an instant cache hit instead of N sync object renders.
	// Content changes invalidate via handleStyleChange / erasing:end /
	// selection events. `fast` halves the bake resolution on big cold
	// selections — this runs inside mouse:down, and the post-commit prewarm
	// upgrades the cache to full quality during idle.
	const baked = bakeSelectionBitmap(c, target, true);
	if (!baked) return;
	prepareEmptyVacatedPatch(c, target);

	const refs: Refs = {
		left: target.left ?? 0,
		top: target.top ?? 0,
		scaleX: target.scaleX ?? 1,
		scaleY: target.scaleY ?? 1,
		angle: target.angle ?? 0,
	};
	session = {
		canvas: c,
		objects: objs,
		target,
		savedOpacity: objs.map((o) => o.opacity ?? 1),
		bitmap: baked.bitmap,
		origin: baked.origin,
		refs,
		origRefs: { ...refs },
		baseZoom: c.viewportTransform![0],
		moveHappened: false,
		rafId: null,
		vacatedBitmap: cachedVacatedMatches(target, c.viewportTransform![0])
			? (cachedVacated?.bitmap ?? null)
			: null,
		vacatedPromise: null,
		oldRegionRetained: false,
		releasePending: false,
	};
	for (const o of objs) if (o.id) ownedIds.add(o.id);

	placeLayer(c, session);
	placeVacatedLayer(c, session);
	if (layerCanvas) layerCanvas.style.display = "none";
	hideVacatedLayer();
	if (!session.vacatedBitmap) {
		const activeSession = session;
		activeSession.vacatedPromise = prepareVacatedForSession(activeSession);
	}
}

/** Re-bake at the current state/zoom and reset the reference frame to "now". */
function rebaseline(c: Canvas, s: Session): void {
	const t = s.target;
	const restore = s.objects.map((o) => o.opacity);
	s.objects.forEach((o, i) => (o.opacity = s.savedOpacity[i]));
	invalidateCache();
	const baked = bakeSelectionBitmap(c, t, true);
	s.objects.forEach((o, i) => (o.opacity = s.moveHappened ? 0 : restore[i]));
	if (!baked) return;

	s.bitmap = baked.bitmap;
	s.vacatedBitmap = null;
	s.vacatedPromise = null;
	s.oldRegionRetained = false;
	hideVacatedLayer();
	s.origin = baked.origin;
	s.refs = {
		left: t.left ?? 0,
		top: t.top ?? 0,
		scaleX: t.scaleX ?? 1,
		scaleY: t.scaleY ?? 1,
		angle: t.angle ?? 0,
	};
	placeLayer(c, s);
	if (s.moveHappened && layerCanvas) {
		layerCanvas.style.display = "block";
		applyTransform(s);
	}
}

// ─── GPU layer ───────────────────────────────────────────────────────────────

function ensureLayer(c: Canvas): HTMLCanvasElement {
	const wrapper = (c as any).wrapperEl as HTMLElement;
	const upper = (c as any).upperCanvasEl as HTMLElement;

	if (layerCanvas && layerCanvas.parentElement === wrapper) return layerCanvas;

	const el = document.createElement("canvas");
	el.className = "fabric-drag-layer";
	Object.assign(el.style, {
		position: "absolute",
		top: "0px",
		left: "0px",
		transformOrigin: "0 0",
		pointerEvents: "none",
		willChange: "transform",
		display: "none",
	} as Partial<CSSStyleDeclaration>);
	wrapper.insertBefore(el, upper);
	layerCanvas = el;
	return el;
}

function ensureVacatedLayer(c: Canvas): HTMLCanvasElement {
	const wrapper = (c as any).wrapperEl as HTMLElement;
	const lower = c.lowerCanvasEl;
	ensureLayer(c);
	if (vacatedLayerCanvas && vacatedLayerCanvas.parentElement === wrapper) {
		wrapper.insertBefore(vacatedLayerCanvas, lower);
		return vacatedLayerCanvas;
	}

	const el = document.createElement("canvas");
	el.className = "fabric-vacated-layer";
	Object.assign(el.style, {
		position: "absolute",
		top: "0px",
		left: "0px",
		pointerEvents: "none",
		display: "none",
	} as Partial<CSSStyleDeclaration>);
	wrapper.insertBefore(el, lower);
	vacatedLayerCanvas = el;
	return el;
}

function placeVacatedLayer(c: Canvas, s: Session): void {
	if (!s.vacatedBitmap) return;
	const el = ensureVacatedLayer(c);
	if (
		el.width !== s.vacatedBitmap.width ||
		el.height !== s.vacatedBitmap.height
	) {
		el.width = s.vacatedBitmap.width;
		el.height = s.vacatedBitmap.height;
	}
	const ctx = el.getContext("2d");
	if (ctx) {
		paintVacatedLayer(
			ctx,
			{ width: el.width, height: el.height },
			String(c.backgroundColor ?? "transparent"),
			s.vacatedBitmap,
		);
	}

	const vpt = c.viewportTransform!;
	const zoom = vpt[0];
	el.style.left = `${s.origin.left * zoom + vpt[4]}px`;
	el.style.top = `${s.origin.top * zoom + vpt[5]}px`;
	el.style.width = `${s.origin.width * zoom}px`;
	el.style.height = `${s.origin.height * zoom}px`;
	// A CSS background takes a different alpha-compositing path than the lower
	// canvas. The background is already rasterized above, just like a composite.
	el.style.backgroundColor = "transparent";
}

function showVacatedLayer(s: Session): void {
	// beginNew already copied and positioned the bitmap. Do not draw from the
	// source again here: a remote edit may have invalidated and closed the cache
	// between pointer-down and the first movement frame.
	maskCommittedCanvas(s);
	if (vacatedLayerCanvas) vacatedLayerCanvas.style.display = "block";
}

function maskCommittedCanvas(s: Session): void {
	const lower = s.canvas.lowerCanvasEl;
	const vpt = s.canvas.viewportTransform!;
	const zoom = vpt[0];
	const hole = snapRectToDevicePixels(
		{
			left: s.origin.left * zoom + vpt[4],
			top: s.origin.top * zoom + vpt[5],
			width: s.origin.width * zoom,
			height: s.origin.height * zoom,
		},
		getRenderDpr(),
	);
	const clipPath = rectangularHoleClipPath(
		{ width: s.canvas.getWidth(), height: s.canvas.getHeight() },
		hole,
	);
	if (!clipPath) return;

	if (maskedLowerCanvas?.element !== lower) clearCommittedCanvasMask();
	if (!maskedLowerCanvas) {
		maskedLowerCanvas = {
			element: lower,
			clipPath: lower.style.clipPath,
			webkitClipPath: lower.style.webkitClipPath,
		};
	}
	lower.style.clipPath = clipPath;
	lower.style.webkitClipPath = clipPath;
}

function hideVacatedLayer(): void {
	if (vacatedLayerCanvas) vacatedLayerCanvas.style.display = "none";
	clearCommittedCanvasMask();
}

function clearCommittedCanvasMask(): void {
	if (!maskedLowerCanvas) return;
	const { element, clipPath, webkitClipPath } = maskedLowerCanvas;
	element.style.clipPath = clipPath;
	element.style.webkitClipPath = webkitClipPath;
	maskedLowerCanvas = null;
}

function activatePreparedCover(s: Session, mgr = useDrawObjectManager()): void {
	if (!s.vacatedBitmap || s.oldRegionRetained) return;
	s.oldRegionRetained = true;
	mgr.retainRegionsUntilRebaked([sessionOriginRect(s)]);
	showVacatedLayer(s);
	const moving = ensureLayer(s.canvas);
	moving.style.display = "block";
	applyTransform(s);
	renderControls(s.canvas);
}

function placeLayer(c: Canvas, s: Session): void {
	const el = ensureLayer(c);

	if (el.width !== s.bitmap.width || el.height !== s.bitmap.height) {
		el.width = s.bitmap.width;
		el.height = s.bitmap.height;
	}
	const ctx = el.getContext("2d");
	if (ctx) {
		ctx.clearRect(0, 0, el.width, el.height);
		ctx.drawImage(s.bitmap, 0, 0);
	}

	const vpt = c.viewportTransform!;
	const zoom = vpt[0];
	s.baseZoom = zoom;

	el.style.left = `${s.origin.left * zoom + vpt[4]}px`;
	el.style.top = `${s.origin.top * zoom + vpt[5]}px`;
	el.style.width = `${s.origin.width * zoom}px`;
	el.style.height = `${s.origin.height * zoom}px`;

	const pivotPxX = (s.refs.left - s.origin.left) * zoom;
	const pivotPxY = (s.refs.top - s.origin.top) * zoom;
	el.style.transformOrigin = `${pivotPxX}px ${pivotPxY}px`;
	el.style.transform = "none";
}

function applyTransform(s: Session): void {
	const el = layerCanvas;
	if (!el) return;
	const t = s.target;
	const zoom = s.baseZoom;

	const sx = (t.scaleX ?? 1) / s.refs.scaleX;
	const sy = (t.scaleY ?? 1) / s.refs.scaleY;
	const angle = (t.angle ?? 0) - s.refs.angle;
	const tx = ((t.left ?? 0) - s.refs.left) * zoom;
	const ty = ((t.top ?? 0) - s.refs.top) * zoom;

	el.style.transform = `translate(${tx}px, ${ty}px) rotate(${angle}deg) scale(${sx}, ${sy})`;
}

const MAX_CHILD_BORDERS = 30;

function renderControls(c: Canvas): void {
	const upper = (c as any).upperCanvasEl as HTMLCanvasElement;
	const ctx = c.getTopContext();
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, upper.width, upper.height);
	ctx.restore();
	const active = c.getActiveObject();
	if (!active) return;
	const childCount = isActiveSelection(active)
		? ((active as any)._objects?.length ?? 0)
		: 0;
	if (childCount > MAX_CHILD_BORDERS) {
		InteractiveFabricObject.prototype._renderControls.call(active as any, ctx);
	} else {
		(active as any)._renderControls(ctx);
	}
}

// ─── Bitmap baking (cached; keyed on shape + zoom, NOT position) ─────────────

/** Above this child count a `fast` (mouse:down) bake halves its resolution;
 *  the idle prewarm then replaces it with a full-quality bake. */
const FAST_BAKE_MIN_CHILDREN = 30;

function bakeSelectionBitmap(
	c: Canvas,
	target: FabricObject,
	fast = false,
): { bitmap: ImageBitmap; origin: Origin } | null {
	const PAD = 8;
	const b = target.getBoundingRect();
	const zoom = c.viewportTransform![0];

	const childCount = isActiveSelection(target)
		? (target as any)._objects?.length || 1
		: 1;
	const lowQuality = fast && childCount > FAST_BAKE_MIN_CHILDREN;

	const curState = {
		id: ((target as any).id as string | undefined) ?? null,
		scaleX: target.scaleX ?? 1,
		scaleY: target.scaleY ?? 1,
		angle: target.angle ?? 0,
		width: target.width ?? 0,
		height: target.height ?? 0,
		zoom,
		lowQuality,
	};

	if (cachedBake) {
		if (cachedBakeMatches(target, zoom, fast)) {
			return {
				bitmap: cachedBake.bitmap,
				origin: {
					left: b.left - PAD,
					top: b.top - PAD,
					width: cachedBake.origin.width,
					height: cachedBake.origin.height,
				},
			};
		}
		invalidateCache();
	}

	const minX = b.left - PAD;
	const minY = b.top - PAD;
	const worldW = b.width + PAD * 2;
	const worldH = b.height + PAD * 2;
	if (worldW <= 0 || worldH <= 0) return null;

	// Capped DPR, not the raw device ratio: this bitmap is stamped straight into
	// the tiles on commit (stampBitmapRegion), so it must be baked at the same
	// resolution the tiles are. See renderQuality.config.ts.
	const dpr = getRenderDpr();
	let scale = zoom * dpr;

	if (childCount > 150) scale *= 0.5;
	else if (childCount > 50) scale *= 0.75;
	if (lowQuality) scale *= 0.5;

	let physW = Math.ceil(worldW * scale);
	let physH = Math.ceil(worldH * scale);

	const fitted = fitTransformBitmap(physW, physH);
	physW = fitted.width;
	physH = fitted.height;
	scale *= fitted.factor;

	const off = new OffscreenCanvas(physW, physH);
	const ctx = off.getContext("2d", { alpha: true });
	if (!ctx) return null;
	ctx.scale(scale, scale);
	ctx.translate(-minX, -minY);

	if (isActiveSelection(target)) {
		useDrawObjectManager().getZIndexMap();
		(target as any)._objects?.sort(compareRenderOrder);
	}

	// Prep the object EXACTLY like isolatedTileRenderer (the proven-good tile
	// path). A brand-new IText grabbed before its first tile bake would otherwise
	// render to an EMPTY bitmap the first time through this path — invisible drag
	// layer until release, when the tile renderer takes over and looks fine.
	//   • isOnScreen: bypass fabric off-screen culling of a canvas-attached obj.
	//   • objectCaching off + dirty: force IText to (re)build its char metrics
	//     and render directly instead of blitting a not-yet-populated cache.
	//   • visible: never skip.
	const prep = target as any;
	const origIsOnScreen = prep.isOnScreen;
	const origCaching = prep.objectCaching;
	const origDirty = prep.dirty;
	const origVisible = prep.visible;
	prep.isOnScreen = () => true;
	prep.objectCaching = false;
	prep.dirty = true;
	prep.visible = true;
	const renderStartedAt = performance.now();
	try {
		target.render(ctx as any);
	} catch (err) {
		console.warn("[transformController] bake render failed", err);
	} finally {
		prep.isOnScreen = origIsOnScreen;
		prep.objectCaching = origCaching;
		prep.dirty = origDirty;
		prep.visible = origVisible;
		recordPhase("selectionBake", performance.now() - renderStartedAt);
	}

	let bitmap: ImageBitmap;
	try {
		bitmap = off.transferToImageBitmap();
	} catch {
		return null;
	}

	const origin: Origin = {
		left: minX,
		top: minY,
		width: worldW,
		height: worldH,
	};
	cachedBake = { bitmap, origin, state: curState };
	return { bitmap, origin };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function cachedBakeMatches(
	target: FabricObject,
	zoom: number,
	acceptLowQuality: boolean,
): boolean {
	if (!cachedBake) return false;
	const state = cachedBake.state;
	return (
		state.id !== null &&
		state.id === (((target as any).id as string | undefined) ?? null) &&
		state.scaleX === (target.scaleX ?? 1) &&
		state.scaleY === (target.scaleY ?? 1) &&
		state.angle === (target.angle ?? 0) &&
		state.width === (target.width ?? 0) &&
		state.height === (target.height ?? 0) &&
		state.zoom === zoom &&
		(!state.lowQuality || acceptLowQuality)
	);
}

function cachedVacatedMatches(target: FabricObject, zoom: number): boolean {
	if (!cachedVacated) return false;
	const state = cachedVacated.state;
	const current = vacatedState(target, zoom);
	return (
		state.id !== null &&
		state.id === current.id &&
		state.left === current.left &&
		state.top === current.top &&
		state.scaleX === current.scaleX &&
		state.scaleY === current.scaleY &&
		state.angle === current.angle &&
		state.width === current.width &&
		state.height === current.height &&
		state.zoom === current.zoom
	);
}

/** A selection over plain canvas needs no object rendering at all. Preparing a
 *  1px transparent bitmap here makes even the very first drag artifact-free. */
function prepareEmptyVacatedPatch(c: Canvas, target: FabricObject): void {
	const zoom = c.viewportTransform![0];
	if (cachedVacatedMatches(target, zoom)) return;
	const { origin } = bitmapGeometry(c, target);
	if (vacatedObjects(target, origin).length !== 0) return;
	const bitmap = transparentBitmap();
	if (!bitmap) return;
	cachedVacated?.bitmap.close();
	cachedVacated = {
		bitmap,
		origin,
		state: vacatedState(target, zoom),
	};
}

function vacatedObjects(target: FabricObject, origin: Origin): FabricObject[] {
	const selected = new Set(
		isActiveSelection(target)
			? ([...(target as any)._objects] as FabricObject[])
			: [target],
	);
	const mgr = useDrawObjectManager();
	mgr.getZIndexMap();
	return mgr
		.query(originRect(origin))
		.filter(
			(object) =>
				!selected.has(object) &&
				object.visible !== false &&
				object.opacity !== 0,
		)
		.sort(compareRenderOrder);
}

function transparentBitmap(): ImageBitmap | null {
	try {
		return new OffscreenCanvas(1, 1).transferToImageBitmap();
	} catch {
		return null;
	}
}

function vacatedState(target: FabricObject, zoom: number) {
	return {
		id: ((target as any).id as string | undefined) ?? null,
		left: target.left ?? 0,
		top: target.top ?? 0,
		scaleX: target.scaleX ?? 1,
		scaleY: target.scaleY ?? 1,
		angle: target.angle ?? 0,
		width: target.width ?? 0,
		height: target.height ?? 0,
		zoom,
	};
}

function bitmapGeometry(
	c: Canvas,
	target: FabricObject,
): {
	origin: Origin;
	width: number;
	height: number;
} {
	const PAD = 8;
	const bounds = target.getBoundingRect();
	const origin = {
		left: bounds.left - PAD,
		top: bounds.top - PAD,
		width: bounds.width + PAD * 2,
		height: bounds.height + PAD * 2,
	};
	let scale = c.viewportTransform![0] * getRenderDpr();
	let width = Math.ceil(origin.width * scale);
	let height = Math.ceil(origin.height * scale);
	({ width, height } = fitTransformBitmap(width, height));
	return { origin, width, height };
}

function fitTransformBitmap(width: number, height: number) {
	return fitBitmapDimensions(
		width,
		height,
		DRAW_MEMORY_PROFILE.transformMaxDimension,
		DRAW_MEMORY_PROFILE.transformMaxPixels,
	);
}

function originRect(origin: Origin) {
	return {
		x: origin.left,
		y: origin.top,
		w: origin.width,
		h: origin.height,
	};
}

function sessionOriginRect(s: Pick<Session, "origin">) {
	return originRect(s.origin);
}

type Mat = [number, number, number, number, number, number];

function mul(m1: Mat, m2: Mat): Mat {
	return [
		m1[0] * m2[0] + m1[2] * m2[1],
		m1[1] * m2[0] + m1[3] * m2[1],
		m1[0] * m2[2] + m1[2] * m2[3],
		m1[1] * m2[2] + m1[3] * m2[3],
		m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
		m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
	];
}

/**
 * bitmap px → CURRENT world coords. Mirrors the CSS layer transform exactly:
 * bitmap px → bake-time world (origin box), then the delta transform about
 * the refs pivot (what applyTransform writes as CSS).
 */
function bitmapToWorldMatrix(s: Session): Mat {
	const t = s.target;
	const rad = (((t.angle ?? 0) - s.refs.angle) * Math.PI) / 180;
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const sx = (t.scaleX ?? 1) / s.refs.scaleX;
	const sy = (t.scaleY ?? 1) / s.refs.scaleY;

	let m: Mat = [1, 0, 0, 1, t.left ?? 0, t.top ?? 0];
	m = mul(m, [cos, sin, -sin, cos, 0, 0]);
	m = mul(m, [sx, 0, 0, sy, 0, 0]);
	m = mul(m, [1, 0, 0, 1, -s.refs.left, -s.refs.top]);
	m = mul(m, [1, 0, 0, 1, s.origin.left, s.origin.top]);
	return mul(m, [
		s.origin.width / s.bitmap.width,
		0,
		0,
		s.origin.height / s.bitmap.height,
		0,
		0,
	]);
}

function isActiveSelection(t: FabricObject): boolean {
	return (t.type || "").toLowerCase() === "activeselection";
}

function sameSet(a: FabricObject[], b: FabricObject[]): boolean {
	if (a.length !== b.length) return false;
	const set = new Set(a);
	for (const o of b) if (!set.has(o)) return false;
	return true;
}
