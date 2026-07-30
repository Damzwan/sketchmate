import { defineStore } from "pinia";
import { Canvas, FabricObject } from "fabric";
import { FabricEvent } from "@/draw/types/draw.types";
import { useDrawEventManager } from "@/draw/store/drawEventManager.store";
import {
	fabricObjectToEntry,
	getViewportRect,
	InfiniteQuadtreeManager,
	QuadtreeEntry,
} from "@/draw/utils/QuadTree";
import {
	getRenderDpr,
	IS_LOW_END_DEVICE,
	IS_MOBILE_DEVICE,
	MAX_RENDER_SCALE,
} from "@/draw/config/renderQuality.config";
import {
	getDrawRenderBackend,
	installDrawRenderBackendDebugApi,
} from "@/draw/config/renderBackend.config";
import { initDrawMetrics } from "@/draw/services/drawMetrics.service";
import { createYielder } from "@/draw/helpers/yielding.helper";
import { isolatedTileRenderer } from "@/draw/helpers/drawTileRenderer.helper";
import { serializeOnce } from "@/draw/helpers/object.helper";
import { useFriendStore } from "@/store/friend.store";
import { rerenderActiveObjectControls } from "@/draw/helpers/render.helper";
import * as localTransform from "@/draw/transform/transformController";
import { RenderCore, type Surface } from "@/draw/renderCore";
import type { WorldRect } from "@/draw/committedLayer";
import {
	bakeryBakeTile,
	bakeryCancel,
	bakeryClear,
	bakeryClipSet,
	bakeryFlushSoon,
	bakeryPauseFlush,
	isBakeryActive,
	bakeryMarkDirty,
	bakeryRemove,
	bakerySeed,
	bakeryTranslate,
	configureTileBakery,
	initTileBakery,
} from "@/draw/services/tileBakery.service";

// Device class + the render-resolution cap now live in renderQuality.config so
// the tile bake scale (maxRenderScale) and the canvas/composite DPR cannot
// drift apart — they are the same constant. See that file for why.
const IS_MOBILE = IS_MOBILE_DEVICE;
const IS_LOW_END = IS_LOW_END_DEVICE;

/**
 * Tile-cache budget — the dominant allocation in this engine, NOT the objects.
 * A 512px tile is 516²×4 ≈ 1.02MB; a 256px tile ≈ 270KB. The cache is pure
 * cache: evicting harder costs a re-bake (now off-thread and cheap) and saves
 * hundreds of MB. overviewPx/poolMax are subtracted from this inside
 * CommittedLayer, so this is the real ceiling for the whole committed layer.
 */
const TILE_BUDGET_MB = IS_LOW_END ? 40 : IS_MOBILE ? 72 : 128;

export const useDrawObjectManager = defineStore("drawObjectManager", () => {
	let c: Canvas | undefined;
	let core: RenderCore<FabricObject> | null = null;

	const objectMap = new Map<string, FabricObject>();
	const quadtree = new InfiniteQuadtreeManager<FabricObject>();
	const entryMap = new Map<string, QuadtreeEntry<FabricObject>>();

	const zIndexMap = new Map<FabricObject, number>();
	let isZIndexDirty = true;

	// ── explicit z-order (decoupled from canvas membership) ───────────────────
	// Canonical stacking is this id→z map, NOT c.getObjects() order. That's the
	// prerequisite for dehydration: an off-canvas object still has a defined z.
	// Seeded from canvas order at load; new objects go on top (++zTop); layer ops
	// mutate it explicitly (front/back = counters, up/down = neighbour swap).
	// Values are only compared, never assumed contiguous — gaps from removals are
	// fine. Rendering + hit-test rank by these via getZIndexMap.
	const zById = new Map<string, number>();
	let zTop = -1;
	let zBottom = 0;

	function zSortedIds(): string[] {
		return [...zById.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
	}

	/**
	 * Give a newly-added object its z.
	 *
	 * A fresh stroke is appended to the top of the canvas → ++zTop, the cheap
	 * common case. But history RESTORES land mid-stack via `canvas.insertAt(idx)`
	 * (erase undo bringing back fully-erased objects, delete undo, ungroup...),
	 * and blindly stamping ++zTop there put them ON TOP of everything —
	 * permanently, since explicit z (not canvas order) is what rendering ranks
	 * by. Spamming undo/redo climbed them higher every cycle.
	 *
	 * So for a mid-stack insert, place z BETWEEN the nearest indexed neighbours
	 * in canvas order. Values are only ever compared, so a fractional midpoint is
	 * fine and needs no renumbering.
	 */
	function assignZOnAdd(obj: FabricObject): void {
		const objs = c!.getObjects();
		// Fast path: appended on top (every freshly drawn object).
		if (objs.length === 0 || objs[objs.length - 1] === obj) {
			zById.set(obj.id, ++zTop);
			return;
		}
		const i = objs.indexOf(obj);
		if (i < 0) {
			zById.set(obj.id, ++zTop);
			return;
		}
		let below: number | undefined;
		for (let k = i - 1; k >= 0; k--) {
			const z = objs[k].id ? zById.get(objs[k].id) : undefined;
			if (z !== undefined) {
				below = z;
				break;
			}
		}
		let above: number | undefined;
		for (let k = i + 1; k < objs.length; k++) {
			const z = objs[k].id ? zById.get(objs[k].id) : undefined;
			if (z !== undefined) {
				above = z;
				break;
			}
		}
		let z: number;
		if (above === undefined) {
			z = ++zTop;
		} else if (below === undefined) {
			z = above - 1;
			if (z < zBottom) zBottom = z;
		} else {
			z = (below + above) / 2;
			// Degenerate gap (neighbours equal / float exhausted) — fall back to
			// sitting just under `above` rather than silently colliding.
			if (!(z > below && z < above)) z = above;
		}
		zById.set(obj.id, z);
	}

	let loadingDepth = 0;
	const isLoading = () => loadingDepth > 0;

	// ── batch mode ─────────────────────────────────────────────────────────
	let batchDepth = 0;
	let batchRects: WorldRect[] = [];
	/**
	 * Objects ADDED during a batch, held back so they can go through the normal
	 * per-object add path at flush time instead of being flattened into a
	 * destructive rect invalidation.
	 *
	 * An add is ADDITIVE: the surrounding tile pixels are still perfectly valid,
	 * so `core.onObjectAdded` can stamp the object straight into the fresh tiles
	 * (or overlay it live) and nothing ever blurs. Turning it into a plain
	 * `markDirty(rect)` — which is what noteRegion did — threw the whole
	 * footprint away and rendered it from the overview until the bake landed.
	 * Every redo of a stroke went through exactly that path.
	 */
	let batchAdds: FabricObject[] = [];
	/** Past this, stamping each object individually costs more than one
	 *  coalesced invalidation (each stamp re-renders into every covered tile). A
	 *  bulk paste / big remote replay keeps the old behaviour. */
	const MAX_BATCH_STAMPED_ADDS = 16;
	const isBatching = () => batchDepth > 0;

	function beginBatch() {
		batchDepth++;
	}

	function endBatch() {
		batchDepth = Math.max(0, batchDepth - 1);
		if (batchDepth !== 0) return;
		const rects = batchRects;
		const adds = batchAdds;
		batchRects = [];
		batchAdds = [];
		if (isLoading() || !core) return;
		if (rects.length === 0 && adds.length === 0) return;
		// Batched changes (remote sync, undo/redo) may have altered objects that
		// are currently selected — the drag-layer bitmap can't be trusted anymore.
		localTransform.invalidateCache();
		// NB: do NOT recompute content bounds here. computeContentBounds is
		// O(all objects) and this runs on EVERY undo/redo and every remote-sync
		// batch — an all-scene scan per interaction on a big board. It is also
		// redundant: invalidateRegions() below calls growContentBounds() for
		// every rect, so growth is already covered. The only thing skipped is
		// SHRINK after a removal, and a slightly-loose content bound merely makes
		// the overview cover a bit of extra empty space — harmless. The full
		// recompute still runs on load / reset (endLoading, resetTileCache).
		if (rects.length) core.invalidateRegions(rects);
		// AFTER the destructive pass, never before: a stamp needs fresh tiles, so
		// running it first would only have it invalidated a moment later. If a
		// rect in this same batch did invalidate the region, the add falls back to
		// the live overlay by itself — correct either way.
		if (adds.length) {
			const order = c!.getObjects();
			const top = order.length ? order[order.length - 1] : null;
			for (const obj of adds) {
				if (!obj.id || !objectMap.has(obj.id)) continue; // added then removed
				core.onObjectAdded(obj, obj === top);
			}
		}
	}

	/** Returns true if the region was absorbed by the batch (skip per-event core). */
	function noteRegion(rect: WorldRect | null | undefined): boolean {
		if (!isBatching()) return false;
		if (rect) batchRects.push(rect);
		return true;
	}

	// ── spatial index handed to the renderer (z-sorted query) ────────────────
	const spatialIndex = {
		query: (rect: WorldRect): FabricObject[] => {
			getZIndexMap(); // ensure __z stamps are current
			const entries = quadtree.query(rect);
			const objs: FabricObject[] = [];
			for (let i = 0; i < entries.length; i++) {
				const o = objectMap.get(entries[i].id);
				if (o) objs.push(o);
			}
			return objs.sort((a, b) => ((a as any).__z ?? 0) - ((b as any).__z ?? 0));
		},
		/**
		 * z-ordered, carrying the bounds the quadtree already tracks (kept current
		 * by updateQuadTree / cachedBounds). Lets the overview's size filter skip
		 * `getBoundingRect(true, true)` — a coord RECOMPUTE per object, which on a
		 * big board was a single un-yielded O(N) block on the main thread.
		 *
		 * The returned rects are the LIVE entry bounds, not copies — read only.
		 */
		queryBounds: (
			rect: WorldRect,
		): { obj: FabricObject; bounds: WorldRect }[] => {
			getZIndexMap();
			const entries = quadtree.query(rect);
			const out: { obj: FabricObject; bounds: WorldRect }[] = [];
			for (let i = 0; i < entries.length; i++) {
				const o = objectMap.get(entries[i].id);
				if (o) out.push({ obj: o, bounds: entries[i].bounds });
			}
			return out.sort(
				(a, b) => ((a.obj as any).__z ?? 0) - ((b.obj as any).__z ?? 0),
			);
		},
	};

	// ── geometry / index helpers ─────────────────────────────────────────────
	function boundsSig(obj: FabricObject): string {
		const a = obj as any;
		const g = obj.group as any; // <-- Check for parent group (ActiveSelection)

		let sig =
			`${a.left},${a.top},${a.scaleX},${a.scaleY},${a.angle},` +
			`${a.skewX},${a.skewY},${a.flipX},${a.flipY},` +
			`${a.width},${a.height},${a.strokeWidth},` +
			`${a.text !== undefined ? a.text.length : 0}`;

		if (g) {
			sig += `|g:${g.left},${g.top},${g.scaleX},${g.scaleY},${g.angle}`;
		}
		return sig;
	}

	function cachedBounds(obj: FabricObject): WorldRect {
		const a = obj as any;
		const sig = boundsSig(obj);

		if (a.__brSig === sig && a.__br) return a.__br as WorldRect;

		// @ts-ignore
		const b = obj.getBoundingRect(true, true);
		const r: WorldRect = { x: b.left, y: b.top, w: b.width, h: b.height };
		a.__brSig = sig;
		a.__br = r;
		return r;
	}

	function objectBounds(obj: FabricObject): WorldRect {
		return cachedBounds(obj);
	}

	/**
	 * Where the object USED to be — its cached footprint, but only while that
	 * cache still predates the object's current geometry. Null once the cache is
	 * current (nothing actually moved) or was never built.
	 *
	 * Style edits reach us already applied, so unlike `collectOldRect` there is no
	 * `transform.original` to rewind to. The bounds cache is the only surviving
	 * record of the old footprint, and it IS still intact at that point because
	 * nothing has re-measured the object yet.
	 */
	function staleBounds(obj: FabricObject): WorldRect | null {
		const a = obj as any;
		if (!a.__br) return null;
		return a.__brSig === boundsSig(obj) ? null : { ...(a.__br as WorldRect) };
	}

	function unionRect(a: WorldRect, b: WorldRect): WorldRect {
		const x = Math.min(a.x, b.x),
			y = Math.min(a.y, b.y);
		const x2 = Math.max(a.x + a.w, b.x + b.w),
			y2 = Math.max(a.y + a.h, b.y + b.h);
		return { x, y, w: x2 - x, h: y2 - y };
	}

	function getZIndexMap(): Map<FabricObject, number> {
		if (isZIndexDirty) {
			zIndexMap.clear();
			// Rank by the explicit z, NOT canvas order — so the stamps stay correct
			// even once off-screen objects have left the fabric canvas (phase 2b).
			for (const [id, obj] of objectMap) {
				const z = zById.get(id) ?? 0;
				zIndexMap.set(obj, z);
				(obj as any).__z = z;
			}
			isZIndexDirty = false;
		}
		return zIndexMap;
	}

	// ── explicit-z mutators (used by layer ops + history) ─────────────────────
	function zGet(ids: string[]): number[] {
		return ids.map((id) => zById.get(id) ?? 0);
	}

	function zRestore(ids: string[], zs: number[]): void {
		for (let i = 0; i < ids.length; i++) zById.set(ids[i], zs[i]);
		isZIndexDirty = true;
	}

	function zToFront(ids: string[]): void {
		// Preserve the moved set's own relative order as it lands on top.
		const ordered = [...ids].sort(
			(a, b) => (zById.get(a) ?? 0) - (zById.get(b) ?? 0),
		);
		for (const id of ordered) zById.set(id, ++zTop);
		isZIndexDirty = true;
	}

	function zToBack(ids: string[]): void {
		const ordered = [...ids].sort(
			(a, b) => (zById.get(b) ?? 0) - (zById.get(a) ?? 0),
		);
		for (const id of ordered) zById.set(id, --zBottom);
		isZIndexDirty = true;
	}

	function zUpOne(ids: string[]): void {
		const order = zSortedIds();
		const pos = new Map(order.map((id, i) => [id, i]));
		const sel = new Set(ids);
		// Process top-most first so a moved object never leapfrogs another moved one.
		const chosen = [...ids].sort(
			(a, b) => (pos.get(b) ?? 0) - (pos.get(a) ?? 0),
		);
		for (const id of chosen) {
			const i = pos.get(id);
			if (i == null || i >= order.length - 1) continue;
			const above = order[i + 1];
			if (sel.has(above)) continue;
			const zi = zById.get(id)!,
				za = zById.get(above)!;
			zById.set(id, za);
			zById.set(above, zi);
			order[i] = above;
			order[i + 1] = id;
			pos.set(above, i);
			pos.set(id, i + 1);
		}
		isZIndexDirty = true;
	}

	function zDownOne(ids: string[]): void {
		const order = zSortedIds();
		const pos = new Map(order.map((id, i) => [id, i]));
		const sel = new Set(ids);
		const chosen = [...ids].sort(
			(a, b) => (pos.get(a) ?? 0) - (pos.get(b) ?? 0),
		);
		for (const id of chosen) {
			const i = pos.get(id);
			if (i == null || i <= 0) continue;
			const below = order[i - 1];
			if (sel.has(below)) continue;
			const zi = zById.get(id)!,
				zb = zById.get(below)!;
			zById.set(id, zb);
			zById.set(below, zi);
			order[i] = below;
			order[i - 1] = id;
			pos.set(below, i);
			pos.set(id, i - 1);
		}
		isZIndexDirty = true;
	}

	function invalidateZIndex() {
		isZIndexDirty = true;
	}

	function markZIndexDirty() {
		isZIndexDirty = true;
	} // for history layer helpers

	function addToQuadTree(obj: FabricObject) {
		const e = fabricObjectToEntry(obj);
		entryMap.set(obj.id, e);
		quadtree.insert(e);
	}

	function removeFromQuadTree(obj: FabricObject) {
		const e = entryMap.get(obj.id);
		if (e) {
			quadtree.remove(e);
			entryMap.delete(obj.id);
		}
	}

	function updateQuadTree(obj: FabricObject) {
		// Geometry changed ⇒ the worker mirror must resync too. This catches every
		// path that moves an object without firing a fabric event (e.g. a drag
		// committed by transformController when a gesture interrupts it).
		bakeryMarkDirty(obj);
		const e = entryMap.get(obj.id);
		if (!e) return;
		const b = cachedBounds(obj);
		e.bounds.x = b.x;
		e.bounds.y = b.y;
		e.bounds.w = b.w;
		e.bounds.h = b.h;
		quadtree.update(e);
	}

	/**
	 * The object's CLIP changed (an erase undo/redo), nothing else. Refresh the
	 * quadtree bounds (usually a no-op — a clip doesn't change geometry) and sync
	 * the mirror at clip granularity instead of re-serializing the whole object.
	 * This is what keeps an erase undo + immediate pan off the main thread. A
	 * flattened clip carries a base64 image and is worker-refused → full-dirty.
	 */
	function clipChanged(obj: FabricObject) {
		const e = entryMap.get(obj.id);
		if (e) {
			const b = cachedBounds(obj);
			e.bounds.x = b.x;
			e.bounds.y = b.y;
			e.bounds.w = b.w;
			e.bounds.h = b.h;
			quadtree.update(e);
		}
		if ((obj as any).__hasImageClip) bakeryMarkDirty(obj);
		else bakeryClipSet(obj);
	}

	/**
	 * Fast-path index update for a PURE TRANSLATION (drag commit): the world
	 * bounds of every object in the selection shift by exactly (dx, dy), so we
	 * shift the entry and the bounds cache instead of recomputing the full
	 * transform chain per object. Falls back to the exact recompute when no
	 * cache exists yet.
	 */
	function offsetQuadTree(obj: FabricObject, dx: number, dy: number) {
		// NB: the worker mirror is moved in ONE batched `bakeryTranslate` by the
		// caller (transformController.commit) — NOT per object here, which would be
		// N postMessages + N re-serializations for a big selection drop.
		const e = entryMap.get(obj.id);
		if (!e) return;
		const a = obj as any;
		if (!a.__br) {
			updateQuadTree(obj);
			return;
		}
		const br = a.__br as WorldRect;
		a.__br = { x: br.x + dx, y: br.y + dy, w: br.w, h: br.h };
		a.__brSig = boundsSig(obj);
		e.bounds.x += dx;
		e.bounds.y += dy;
		quadtree.update(e);
	}

	function computeContentBounds(): WorldRect | null {
		// From the quadtree ENTRIES (bbox per id), not live objects — so this stays
		// correct once off-screen objects dehydrate off the fabric canvas (2b). The
		// entry set is the full scene; objectMap is only the hydrated subset.
		let x0 = Infinity,
			y0 = Infinity,
			x1 = -Infinity,
			y1 = -Infinity;
		for (const e of entryMap.values()) {
			const b = e.bounds;
			if (!isFinite(b.x) || b.w <= 0 || b.h <= 0) continue;
			x0 = Math.min(x0, b.x);
			y0 = Math.min(y0, b.y);
			x1 = Math.max(x1, b.x + b.w);
			y1 = Math.max(y1, b.y + b.h);
		}
		if (!isFinite(x0)) return null;
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	}

	/**
	 * Pre-move bounding rect, so the object's OLD footprint gets rebuilt. Resets
	 * the object to its original transform, measures, then restores. Uses
	 * cachedBounds — the temporary set() changes the signature, so it recomputes
	 * the old bounds and self-heals on restore.
	 */
	function collectOldRect(o: FabricObject, transform: any): WorldRect | null {
		const oldText = (o as any)._textBeforeEdit;
		const isTextChanged = oldText !== undefined && oldText !== (o as any).text;
		if (!transform?.original && !isTextChanged) return null;
		const cur = {
			left: o.left,
			top: o.top,
			scaleX: o.scaleX,
			scaleY: o.scaleY,
			skewX: o.skewX,
			skewY: o.skewY,
			angle: o.angle,
			flipX: o.flipX,
			flipY: o.flipY,
			originX: o.originX,
			originY: o.originY,
			text: (o as any).text,
		};
		try {
			if (transform?.original) o.set(transform.original);
			if (isTextChanged && oldText.length > (o as any).text.length)
				o.set({ text: oldText });
			o.setCoords();
			const b = cachedBounds(o);
			const snapshot = { ...b }; // copy — cache entry will be overwritten on restore
			o.set(cur);
			o.setCoords();
			return snapshot;
		} catch {
			o.set(cur);
			o.setCoords();
			return null;
		}
	}

	// ── renderers handed to the core ─────────────────────────────────────────
	/**
	 * Render one in-flight object directly over the composited tiles.
	 *
	 * Runs EVERY FRAME for every live item, so what it does per call matters.
	 *
	 * It used to force `a.dirty = true`. `isolatedTileRenderer` deliberately
	 * does not (see the note there): fabric force-caches any object with a
	 * clipPath — every ERASED object — via `needsItsOwnCache()`, and forcing
	 * dirty makes `_updateCacheCanvas` re-rasterize the whole clip stack. Doing
	 * that on the tile path was the historical super-linear erase lag; doing it
	 * here did the same thing at 60Hz for the duration of every live overlay.
	 *
	 * Instead, mirror the tile renderer: clear caching and report the VIEWPORT
	 * scale as the total object scaling, so fabric's own `zoomChanged` check
	 * regenerates the cache exactly once per real change and blits it after.
	 * Real mutations (set(), commitErasing) still flag dirty themselves.
	 */
	function renderLive(ctx: CanvasRenderingContext2D, obj: FabricObject) {
		const a = obj as any;
		const needsCanvas = !!a.clipPath || !!a.shadow;
		const prevCanvas = a.canvas;
		const prevCaching = a.objectCaching;
		const prevScaling = a.getTotalObjectScaling;

		if (!needsCanvas) a.canvas = null;
		a.objectCaching = false;

		const vpt = c!.viewportTransform!;
		const liveScale = Math.abs(vpt[0]) || 1;
		a.getTotalObjectScaling = function () {
			return this.getObjectScaling().scalarMultiply(liveScale);
		};

		// Shadow blur is in world units here but fabric applies it in the
		// current context space, so scale it with the viewport.
		const originalBlur = a.shadow?.blur;
		if (a.shadow) a.shadow.blur = originalBlur * vpt[0];

		try {
			obj.render(ctx);
		} catch {
			/* ignore */
		} finally {
			if (!needsCanvas) a.canvas = prevCanvas;
			a.objectCaching = prevCaching;
			a.getTotalObjectScaling = prevScaling;
			if (a.shadow) a.shadow.blur = originalBlur;
		}
	}

	// ── fabric events → core lifecycle ───────────────────────────────────────
	function onObjectAdded(obj: FabricObject) {
		if (!obj.id) return;
		objectMap.set(obj.id, obj);
		if (isLoading()) return; // bulk loads reseed the bakery in rebuildIndexFromCanvas
		// Seed the mirror from the SHARED serialization instead of marking dirty
		// (which would make the idle flush run a third toJSON of this same
		// stroke). serializeOnce is memoized for this dispatch, so the sync emit
		// and the history entry have already paid for it — or will reuse ours.
		// bakerySeed stashes it and drops the stash on the next real mutation.
		bakerySeed(obj, serializeOnce(obj));
		bakeryFlushSoon();
		addToQuadTree(obj);
		assignZOnAdd(obj);
		// INCREMENTAL z-stamp. assignZOnAdd only assigns THIS object's z (append,
		// or a fractional midpoint on a mid-stack insert) — no existing object's z
		// changes. So stamp just this one instead of flagging isZIndexDirty, which
		// forces getZIndexMap to rebuild O(all objects) on the next bake. That
		// rebuild fires after EVERY stroke commit, so on an N-object board drawing
		// was O(N) per stroke — O(N²) over a session. If a full rebuild is already
		// pending, let it subsume this. Layer ops still set the flag (they move
		// many objects' z); removal drops the entry (onObjectRemoved).
		if (!isZIndexDirty) {
			const z = zById.get(obj.id) ?? 0;
			(obj as any).__z = z;
			zIndexMap.set(obj, z);
		}
		if (isBatching()) {
			// Hold it for the flush so it keeps the ADDITIVE path (stamp / live
			// overlay) instead of collapsing into a destructive rect. Past the cap,
			// fall back to the coalesced invalidation.
			if (batchAdds.length < MAX_BATCH_STAMPED_ADDS) batchAdds.push(obj);
			else noteRegion(objectBounds(obj));
			return;
		}
		const arr = c!.getObjects();
		const topmost = arr.length > 0 && arr[arr.length - 1] === obj;
		core?.onObjectAdded(obj, topmost);
	}

	/**
	 * Register objects added while actionWithoutEvents() had Fabric's
	 * object:added listener detached. Without this, they exist only in Fabric's
	 * display list: the active-object layer can show them briefly, but the tile
	 * renderer cannot find them after the next viewport redraw.
	 */
	function registerAddedObjects(objects: FabricObject[]) {
		if (!objects.length) return;
		beginBatch();
		try {
			for (const obj of objects) onObjectAdded(obj);
		} finally {
			endBatch();
		}
	}

	function onObjectRemoved(obj: FabricObject) {
		if (!obj.id) return;
		const oldRect = objectBounds(obj);
		objectMap.delete(obj.id);
		zById.delete(obj.id);
		bakeryRemove(obj.id);
		removeFromQuadTree(obj);
		// Removing an object changes no OTHER object's z, so no O(all) rebuild —
		// just drop it from the denormalized map (mirrors the incremental add in
		// onObjectAdded). If a full rebuild is already pending, it will handle it.
		if (!isZIndexDirty) zIndexMap.delete(obj);
		if (isLoading()) return;
		if (noteRegion(oldRect)) return;
		core?.onObjectRemoved(obj, oldRect);
	}

	function onObjectModified(e: any) {
		const obj = e.target as FabricObject;
		if (!obj.id || !core) return;
		// Local drag is owned by transformController (it renders its own layer).
		if (localTransform.ownsTarget(obj)) {
			updateQuadTree(obj);
			return;
		}

		const oldRect = collectOldRect(obj, e.transform);
		updateQuadTree(obj);
		if (isLoading()) return;
		if (isBatching()) {
			const cur = objectBounds(obj);
			noteRegion(oldRect ? unionRect(cur, oldRect) : cur);
			return;
		}
		core.onObjectChangedCoalesced(obj, oldRect ?? undefined);
	}

	function handleStyleChange(e: any) {
		if (isLoading() || !core) return;
		// The transform controller's selection bitmap may show these objects.
		localTransform.invalidateCache();
		const list = (
			Array.isArray(e.target) ? e.target : [e.target]
		) as FabricObject[];
		const rects: WorldRect[] = [];
		let firstObj: FabricObject | null = null;
		let firstOldRect: WorldRect | undefined;
		for (const obj of list) {
			if (!obj?.id) continue;
			// Grab the pre-mutation footprint BEFORE updateQuadTree re-measures and
			// overwrites the cache. A style change can SHRINK an object — swapping to
			// a narrower font, mainly — and invalidating only the new (smaller) rect
			// is purely additive, so the pixels it vacated stay baked into the tiles
			// as leftover specks.
			const oldRect = staleBounds(obj);
			updateQuadTree(obj);
			const cur = objectBounds(obj);
			if (!firstObj) {
				firstObj = obj;
				firstOldRect = oldRect ?? undefined;
			}
			rects.push(oldRect ? unionRect(cur, oldRect) : cur);
		}
		if (!firstObj) return;
		if (isBatching()) {
			for (const r of rects) noteRegion(r);
			return;
		}
		// Single object keeps the precise per-object path; multi-object collapses
		// into ONE merged invalidation instead of N overview patches + N bakes.
		if (rects.length === 1) core.onObjectChanged(firstObj, firstOldRect);
		else core.invalidateRegions(rects);
	}

	const events: FabricEvent[] = [
		{ on: "object:added", handler: (e: any) => onObjectAdded(e.target) },
		{ on: "object:removed", handler: (e: any) => onObjectRemoved(e.target) },
		{ on: "object:modified", handler: (e: any) => onObjectModified(e) },
		{
			on: "fullErase",
			handler: () => {
				bakeryClear();
				core?.reset();
				core?.requestFrame();
			},
		},
		{
			on: "backgroundColorChanged",
			handler: () => core?.requestFrame(),
		},
		{
			on: "invalidateCanvas",
			handler: (e: any) => handleStyleChange(e),
		},
		{
			on: "render:patchModifiedObject",
			handler: (e: any) => {
				const obj = e.target as FabricObject;
				const o = e.oldRect;
				if (!obj || !o || !core) return;
				localTransform.invalidateCache();
				updateQuadTree(obj);
				if (isLoading()) return;
				const oldRect: WorldRect = {
					x: o.x ?? o.left,
					y: o.y ?? o.top,
					w: o.w ?? o.width,
					h: o.h ?? o.height,
				};
				if (isBatching()) {
					noteRegion(unionRect(objectBounds(obj), oldRect));
					return;
				}
				core.onObjectChanged(obj, oldRect);
			},
		},
		{ on: "textStyleChanged", handler: (e: any) => handleStyleChange(e) },
		{ on: "objectStyleChanged", handler: (e: any) => handleStyleChange(e) },
		{ on: "imgFilterChanged", handler: (e: any) => handleStyleChange(e) },
		{ on: "flip", handler: (e: any) => handleStyleChange(e) },
		{
			on: "layer:changed",
			handler: (e: any) => {
				isZIndexDirty = true;
				handleStyleChange(e);
			},
		},
		{
			on: "erasing:end",
			handler: (e: any) => {
				if (isLoading() || !core) return;
				const d = e.detail ?? {};
				const path = d.path as FabricObject | undefined;
				const rect = d.dirtyRect as WorldRect | undefined;
				localTransform.invalidateCache(); // selected pixels may have changed
				// Targets now carry the new eraser clipPath. Sync the mirror at CLIP
				// granularity — only the clip changed, so shipping the whole object
				// (bakeryMarkDirty) re-serializes its full path + props for nothing.
				// A flattened clip holds a base64 image (huge to ship) and is refused
				// by the worker anyway → full-dirty path, which flushObjects drops.
				for (const t of (d.targets ?? []) as FabricObject[]) {
					if (!t?.id) continue;
					if ((t as any).__hasImageClip) bakeryMarkDirty(t);
					else bakeryClipSet(t);
				}
				if (isBatching()) {
					if (rect) noteRegion(rect);
					return;
				}
				// Tile-stamp fast path only for a plain full erase: selective (lobby)
				// erasing must re-render from objects, inverted "un-erase" adds pixels.
				const canStamp =
					!d.selective &&
					(path as any)?.globalCompositeOperation === "destination-out";
				if (path && rect) core.onErase(path, rect, canStamp);
				else if (rect) core.markDirty(rect);
			},
		},
	];

	// ── init / lifecycle ─────────────────────────────────────────────────────
	function init(canvas: Canvas) {
		c = canvas;
		const renderBackend = getDrawRenderBackend();
		installDrawRenderBackendDebugApi();
		initDrawMetrics(getRenderDpr, () => renderBackend);
		configureTileBakery(renderBackend === "worker");
		initTileBakery(); // no-op in main mode; otherwise warms worker parse

		const surface: Surface = {
			getContext: () => c!.getContext(),
			getSize: () => ({ w: c!.getElement().width, h: c!.getElement().height }),
			getVpt: () => c!.viewportTransform!,
			// MUST equal fabric's getRetinaScaling(): getSize() reports the backing
			// store fabric sized from config.devicePixelRatio, and viewWorld divides
			// by this. A mismatch scales the whole composite wrong.
			getDpr: getRenderDpr,
			getBackground: () => c!.backgroundColor as string,
		};

		core = new RenderCore<FabricObject>(
			spatialIndex,
			isolatedTileRenderer,
			renderLive,
			surface,
			() => createYielder({ budgetMs: IS_LOW_END ? 4 : 8 }) as any,
			{
				memoryBudgetMB: TILE_BUDGET_MB,
				// 2048² RGBA = 16.8MB resident, plus a transient twin during every
				// rebuild (worker canvas + returned bitmap). 1024² = 4.2MB and the
				// overview is a low-res approximation anyway.
				overviewPx: IS_MOBILE ? 1024 : 2048,
				// Tier INDEX at and below which the overview IS the picture and no
				// tiles are composited. This is an INDEX, and the ladder moved up one
				// step (0.0625 dropped, 32 added) — so 2 → 1 keeps the same *zoom*
				// threshold (0.25) it has always had.
				//
				// Do not lower it to 0 without solving tile count first: tier 1 tiles
				// are `tileSize / 0.25` = ~1.5k world units each, and at the zoom
				// where tier 1 is active the viewport spans ~18k × 36k world units on
				// a phone — ~290 tiles, ~170MB, against a 40–72MB mobile budget. The
				// coarse end of the zoom range needs the overview until tiles there
				// are cheaper (see docs/DRAW_ENGINE_V3_PLAN.md, O1/O2).
				//
				// What actually shrinks the blurry zone today is the tier floor
				// (0.031 → 0.0625) plus the content-aware zoom clamp in
				// getZoomLimits().
				overviewTier: 1,
				liveMax: IS_LOW_END ? 32 : 64,
				afterComposite: () => {
					if (c) rerenderActiveObjectControls(c);
				},
				// 256px tiles are ~270KB vs ~1.02MB at 512 — 4x finer eviction
				// granularity and far less wasted area on sparse regions.
				tileSize: IS_LOW_END ? 384 : IS_MOBILE ? 384 : 512,
				// The pool holds IDLE tile-sized canvases; 16 of them was 16MB parked.
				poolMax: IS_LOW_END ? 3 : IS_MOBILE ? 4 : 8,
				// NB: tiles rasterize at `zoom * renderScale` but composite at
				// `zoom * dpr`, so a cap below the device dpr IS a mild upscale
				// (1.5x on a dpr-3 phone). Left at the ORIGINAL values on purpose:
				// tile count scales with renderScale², and this was NOT the cause
				// of the blur — see the tier-scale cache fix in
				// drawTileRenderer.helper.ts. Raise it only as a deliberate
				// sharpness-for-memory trade.
				// UPDATE: bake scale and composite DPR are now the SAME constant
				// (MAX_RENDER_SCALE also feeds fabric's config.devicePixelRatio), so
				// the upscale described above no longer exists — tiles bake and
				// composite at identical resolution.
				maxRenderScale: MAX_RENDER_SCALE,
				overviewPatchMax: IS_LOW_END ? 80 : 200,
				// Objects rendered between yield/abort checks in a LOCAL (main-thread)
				// tile bake. The default 64 assumes cheap objects; it is a per-object
				// count standing in for a time budget, and heavy brushes break that
				// assumption badly — a WaterColorStroke is ~3x the path segments of a
				// pencil stroke (3 bristles) and strokes with round joins uncached, so
				// 64 of them is a tens-of-ms block with no abort check inside it. A
				// gesture that starts mid-tile has to wait it out. 16 keeps the worst
				// case to roughly a frame; the extra `isInputPending()` calls are far
				// cheaper than the block they interrupt.
				renderChunk: IS_LOW_END ? 8 : IS_MOBILE ? 16 : 32,
				// Omitting the remote baker activates CommittedLayer's maintained,
				// pooled and yield-friendly local path. Every other engine option is
				// identical, keeping this a one-variable A/B comparison.
				remoteBaker: renderBackend === "worker" ? bakeryBakeTile : undefined,
				// Keep the whole-board overview local. A hybrid worker overview
				// cannot flatten interleaved skipped objects without changing z/order
				// and alpha compositing, and a bad overview means every uncovered tile
				// is visibly blank or wrong while zoom sharpening catches up.
			},
		);

		rebuildIndexFromCanvas();
		core.setContentBounds(computeContentBounds());
		core.markAllDirty();
		core.warmOverview();
		useDrawEventManager().addPermanentEvents(events);
		core.requestFrame();
	}

	function beginIndexRebuild() {
		objectMap.clear();
		entryMap.clear();
		quadtree.clear();
		zById.clear();
		bakeryClear();
		isZIndexDirty = true;
	}

	function indexCanvasObject(
		obj: FabricObject,
		isBlocked: (userId: string) => boolean,
	) {
		if (isBlocked(obj.userId)) {
			c?.remove(obj);
			return;
		}
		if (obj.id) {
			objectMap.set(obj.id, obj);
			addToQuadTree(obj);
			// Prefer the JSON the object was enlivened FROM (stashed at load) so the
			// mirror seeds with zero toJSON; fall back to a lazy serialize otherwise.
			const src = (obj as any).__bakeJSON;
			if (src) bakerySeed(obj, src);
			else bakeryMarkDirty(obj);
		}
	}

	function finishIndexRebuild() {
		// Seed z from the final canvas order (0 = back). After this, canvas order is
		// no longer the z authority — layer ops + adds maintain zById directly.
		const finalObjs = c!.getObjects();
		zTop = -1;
		zBottom = 0;
		for (let i = 0; i < finalObjs.length; i++) {
			const id = finalObjs[i].id;
			if (id) {
				zById.set(id, i);
				zTop = i;
			}
		}
		// Start seeding the worker mirror NOW, in idle-sized chunks, instead of
		// letting the first bake ship the whole scene in one blocking postMessage.
		bakeryFlushSoon();
	}

	function rebuildIndexFromCanvas() {
		const { isBlocked } = useFriendStore();
		beginIndexRebuild();
		const objs = c!.getObjects();
		for (let i = objs.length - 1; i >= 0; i--) {
			indexCanvasObject(objs[i], isBlocked);
		}
		finishIndexRebuild();
	}

	async function rebuildIndexFromCanvasYielded() {
		const { isBlocked } = useFriendStore();
		const yielder = createYielder({ budgetMs: IS_LOW_END ? 4 : 6 });
		beginIndexRebuild();
		const objs = c!.getObjects();
		yielder.reset();
		for (let i = objs.length - 1; i >= 0; i--) {
			indexCanvasObject(objs[i], isBlocked);
			await yielder.maybeYield();
		}
		finishIndexRebuild();
	}

	// ── gesture / frame ──────────────────────────────────────────────────────
	function renderMain() {
		core?.requestFrame();
	}

	function renderViewport() {
		core?.requestFrame();
	}

	/**
	 * Composite synchronously — ONLY for callers already inside a RAF callback
	 * (the gesture scheduler). Going through requestFrame() there costs a second
	 * RAF hop, so every pan/zoom frame painted two frames late. See
	 * RenderCore.renderFrameNow.
	 */
	function renderViewportNow() {
		core?.renderFrameNow();
	}

	function onGestureStart() {
		if (!c || !core) return;
		if (localTransform.isActive()) localTransform.commit(c);
		// ORDER MATTERS. setGesturing(true) aborts the bake signal FIRST; only then
		// may we cancel the worker. bakeryCancel settles pending requests `null`,
		// and a `null` from the remote baker means "worker declined" — which sends
		// rebuildTile into a synchronous MAIN-THREAD bake unless the signal is
		// already aborted. Reverse these two lines and a gesture stops offloading
		// tiles and starts rendering them on the thread it was trying to free.
		core.setGesturing(true);
		// The worker keeps rasterizing whatever was already posted otherwise, and
		// its GPU-backed canvas contends with the compositor driving this gesture.
		bakeryCancel();
		// The idle drain fires in the (now large) gaps between gesture frames and
		// each run is a synchronous toJSON + structured-clone block. Park it.
		bakeryPauseFlush(true);
	}

	function onGestureEnd() {
		core?.setGesturing(false);
		bakeryPauseFlush(false);
	}

	function setErasing(on: boolean) {
		core?.setErasing(on);
		// Match the gesture seam: abort the core first, then settle/cancel already
		// posted worker bakes. Otherwise the worker keeps rasterizing into its
		// GPU-backed canvas while the eraser is trying to own the frame budget.
		if (on) bakeryCancel();
	}

	function dropRegion(rect: WorldRect) {
		localTransform.invalidateCache(); // e.g. erase undo changed selected pixels
		core?.dropRegion(rect);
	}

	/** Bounded-sync drop for the transform controller's drag seams and history
	 *  invalidations. By default does NOT invalidate the transform cache — the
	 *  selection itself is unchanged by a move, and nuking the cache here would
	 *  force a full re-bake on every re-grab. Callers whose change DOES alter
	 *  selected pixels (erase undo/redo) pass `invalidateSelectionCache`. */
	/**
	 * @param coveredByLayer true only when the caller keeps something on screen
	 *   over the dropped region until the async bake lands (the transform
	 *   controller's GPU drag layer). Then the synchronous tile repair is
	 *   redundant main-thread work — 4-8 full object renders per commit, which
	 *   is what made a spammed move stall — and we can skip it.
	 *
	 *   ERASE UNDO MUST NOT SET THIS. Nothing covers the region there, and the
	 *   overview still holds the hole punched into it by `overview.eraseObject`
	 *   at erase time, so dropping the tiles with no sync repair composites the
	 *   stale overview and the undone stroke stays visible until a later bake.
	 */
	function dropRegionLight(
		rect: WorldRect,
		invalidateSelectionCache = false,
		coveredByLayer = false,
		maxSyncTilesOverride?: number,
	) {
		if (invalidateSelectionCache) localTransform.invalidateCache();
		const syncTiles =
			maxSyncTilesOverride ??
			(coveredByLayer && isBakeryActive() ? 0 : IS_LOW_END ? 4 : 8);
		core?.dropRegionLight(rect, syncTiles);
	}

	/**
	 * Region repair for an ERASE undo/redo. The old path sync-rebuilt up to 8
	 * tiles on the main thread over the (often large) union of every object the
	 * stroke touched, rendering their clip groups each time — the "everything
	 * gets laggier after erase undo/redo". When the worker bakery is alive it
	 * bakes the exact same region correctly OFF-thread (erased objects with a
	 * ClippingGroup clip are worker-shippable), so we only need a couple of sync
	 * tiles for instant feedback under the cursor and let the async bake +
	 * overview cover the rest. Falls back to the full sync repair when the
	 * bakery is unavailable (no async help then).
	 */
	/**
	 * @param rect       union of the stroke footprint and every object it
	 *                   touched — the region whose TILES must be re-baked.
	 * @param changedRect the eraser stroke's own footprint: the only place the
	 *                   PIXELS actually differ. Optional; without it the union
	 *                   is treated as changed (the old, blurry behaviour).
	 */
	function dropRegionEraseUndo(rect: WorldRect, changedRect?: WorldRect) {
		localTransform.invalidateCache();
		// Splitting the two rects is what fixes "undo an erase and the whole
		// drawing blurs": an eraser stroke across a big drawing unions with every
		// object's FULL bounds, so the old single-rect invalidation threw away a
		// screenful of correct pixels to repaint a thin trail.
		//
		// Sync tiles stay small: the changed rect is now the stroke, not the
		// union, so this is a couple of tile renders under the cursor rather than
		// 8 clip renders over the whole footprint (the erase-undo jank of the
		// fourth review). Without a worker to lean on, repair more.
		const syncTiles = isBakeryActive() ? 2 : IS_LOW_END ? 4 : 8;
		core?.invalidateChanged(changedRect ?? rect, changedRect ? rect : null, syncTiles);
	}

	/**
	 * History redo of a plain (destination-out) erase: punch the stroke into
	 * the fresh tiles and the overview — pixel-exact, O(touched tiles), zero
	 * object re-rendering — instead of dropping the region and sync-rebuilding
	 * it from objects. The caller has already applied the clip mutations, so
	 * any tile the stamp couldn't cover goes stale and rebakes to the same
	 * state.
	 */
	function eraseStampCommit(path: FabricObject, rect: WorldRect) {
		if (!core) return;
		localTransform.invalidateCache(); // selected pixels changed
		core.onErase(path, rect, true);
	}

	/** Stamp the drag-layer bitmap into tiles on transform commit. */
	function stampRegionBitmap(
		rect: WorldRect,
		bmp: ImageBitmap,
		m: [number, number, number, number, number, number],
	): boolean {
		return core ? core.stampRegionBitmap(rect, bmp, m) : false;
	}

	function recordPanDelta(_dx: number, _dy: number) {
		/* directional prefetch retired */
	}

	/**
	 * Batched mirror move for a pure-translation drag commit. One message shifts
	 * every selected object's mirrored coords by (dx,dy) — no per-object toJSON.
	 * Paired with offsetQuadTree, which handles the main-thread spatial index.
	 */
	function translateMirror(objects: FabricObject[], dx: number, dy: number) {
		if (dx === 0 && dy === 0) return;
		const ids: string[] = [];
		for (const o of objects) if (o.id) ids.push(o.id);
		bakeryTranslate(ids, dx, dy);
	}

	// ── loading ──────────────────────────────────────────────────────────────
	function beginLoading() {
		if (loadingDepth === 0) core?.setLoading(true);
		loadingDepth++;
	}

	async function endLoading() {
		loadingDepth = Math.max(0, loadingDepth - 1);
		if (loadingDepth !== 0) return;
		if (!core || !c) return;

		// One load finalization pass. Callers used to rebuild the index, reset all
		// tiles, synchronously warm the overview, then come through here and do
		// the same rebuild/dirty/warm sequence again. Besides the duplicate CPU
		// and allocations, both overview jobs could overlap.
		core.reset();
		await rebuildIndexFromCanvasYielded();
		core.setContentBounds(computeContentBounds());
		await core.warmOverviewBlocking();
		core.setLoading(false);
		core.requestFrame();
		core.scheduleBake();
	}

	// ── blocked users ────────────────────────────────────────────────────────
	function purgeBlockedObjects() {
		const { isBlocked } = useFriendStore();
		const toRemove: FabricObject[] = [];
		objectMap.forEach((o) => {
			if (isBlocked(o.userId)) toRemove.push(o);
		});
		if (!toRemove.length) return;
		// c.remove() fires object:removed → onObjectRemoved does index + core work;
		// doing it manually here as well double-invalidated every region. Batch so
		// N removals collapse into one invalidateRegions pass.
		beginBatch();
		try {
			for (const obj of toRemove) c?.remove(obj);
		} finally {
			endBatch();
		}
		invalidateZIndex();
	}

	// ── public query API ─────────────────────────────────────────────────────
	function query(rect: WorldRect): FabricObject[] {
		return quadtree
			.query(rect)
			.map((e) => objectMap.get(e.id))
			.filter(Boolean) as FabricObject[];
	}

	function getVisibleObjects(): FabricObject[] {
		return quadtree
			.query(getViewportRect(c!))
			.map((e) => objectMap.get(e.id))
			.filter(Boolean) as FabricObject[];
	}

	function getObjectById(id: string) {
		return objectMap.get(id);
	}

	function getObjectsById(ids: string[]): FabricObject[] {
		return ids.map((id) => objectMap.get(id)).filter(Boolean) as FabricObject[];
	}

	// ── reset / rebuild ──────────────────────────────────────────────────────
	function resetTileCache() {
		core?.reset();
		core?.setContentBounds(computeContentBounds());
		core?.warmOverview();
		core?.requestFrame();
	}

	/** Await a full overview (base-layer) build. Called during the load reveal so
	 *  the first painted frame after a room join already has content — no white
	 *  flash. Paints stay suppressed by the core's loading gate until endLoading. */
	async function warmOverviewBlocking() {
		await core?.warmOverviewBlocking();
	}

	function rebuildSpatialIndex() {
		if (!c || !core) return;
		rebuildIndexFromCanvas();
		core.reset();
		core.setContentBounds(computeContentBounds());
		core.warmOverview();
		core.requestFrame();
	}

	// ── compatibility shims for external callers ─────────────────────────────
	function scheduleRectPatch(rect: WorldRect) {
		core?.markDirty(rect);
	}

	function scheduleObjectPatch(obj: FabricObject) {
		core?.markDirty(objectBounds(obj));
	}

	function flushPatchesNow(_force = false) {
		core?.requestFrame();
	}

	function isRegionBaked(rect: WorldRect): boolean {
		return core ? core.isRegionBaked(rect) : true;
	}

	function patchRectSync(rect: WorldRect) {
		if (!core || !c) return;
		if (noteRegion(rect)) return; // batched → one invalidate at endBatch
		const vpt = c.viewportTransform!;
		const tier = core.pickActiveTier(vpt[0]);
		core.markDirtyAndRebuildSync(rect, tier);
	}

	/**
	 * How much empty space around the drawing the user may zoom out to. 0.55 =>
	 * the content is allowed to shrink to ~55% of the viewport before the zoom
	 * stops. Below that the whole board is a handful of pixels wide, every pixel
	 * comes from the coarsest data we have, and nothing useful is visible —
	 * which is exactly the "fully zoomed out is too blurry" report, and it is
	 * worst in a lobby where the content bounds span many drawings.
	 */
	const ZOOM_OUT_SLACK = 0.55;

	/**
	 * Zoom clamps. The tier floor/ceiling are hard engine limits (we cannot bake
	 * a tier that does not exist); the CONTENT floor is a UX limit that scales
	 * with how much there is to look at.
	 *
	 * Read this per gesture, never once at setup: the content bounds grow while
	 * the user draws and while remote strokes arrive.
	 */
	function getZoomLimits() {
		if (!core || !c) return { min: 0.03125, max: 32 };
		const min = core.minZoom;
		const max = core.maxZoom;
		const bounds = core.getContentBounds();
		if (!bounds || bounds.w <= 0 || bounds.h <= 0) return { min, max };
		// This store is a pinia singleton and OUTLIVES the canvas: on re-entering
		// the draw view, `enableGestures` runs before `init(canvas)` rebinds `c`,
		// so `c` still points at the DISPOSED canvas of the previous session.
		// fabric's getElement() then throws "Cannot read properties of undefined
		// (reading 'el')". The tier limits are always valid, so fall back to them
		// rather than letting a UX refinement break canvas setup.
		let vw = 0;
		let vh = 0;
		try {
			const el = c.getElement();
			if (!el) return { min, max };
			const dpr = getRenderDpr();
			vw = el.width / dpr;
			vh = el.height / dpr;
		} catch {
			return { min, max };
		}
		if (!(vw > 0) || !(vh > 0)) return { min, max };
		// Zoom at which the content exactly fills the viewport, times the slack.
		const fit = Math.min(vw / bounds.w, vh / bounds.h) * ZOOM_OUT_SLACK;
		// Never TIGHTEN past the tier ceiling, and never let a tiny drawing raise
		// the floor above 1 (you must always be able to see a stroke at 1:1).
		return { min: Math.min(Math.max(min, fit), 1), max };
	}

	function clearAllObjects() {
		if (!c || !core) return;
		objectMap.clear();
		entryMap.clear();
		quadtree.clear();
		bakeryClear();
		zIndexMap.clear();
		zById.clear();
		zTop = -1;
		zBottom = 0;
		isZIndexDirty = true;
		core.reset();
		core.setContentBounds(null);
		core.requestFrame();
	}

	return {
		init,
		renderMain,
		renderViewport,
		renderViewportNow,
		onGestureStart,
		onGestureEnd,
		recordPanDelta,
		purgeBlockedObjects,
		query,
		getZIndexMap,
		updateQuadTree,
		clipChanged,
		offsetQuadTree,
		getObjectBounds: objectBounds,
		getStaleObjectBounds: staleBounds,
		getVisibleObjects,
		getObjectById,
		getObjectsById,
		registerAddedObjects,
		translateMirror,
		zToFront,
		zToBack,
		zUpOne,
		zDownOne,
		zGet,
		zRestore,
		beginLoading,
		endLoading,
		isLoading,
		resetTileCache,
		warmOverviewBlocking,
		rebuildSpatialIndex,
		scheduleRectPatch,
		scheduleObjectPatch,
		flushPatchesNow,
		isRegionBaked,
		setErasing,
		dropRegion,
		dropRegionLight,
		dropRegionEraseUndo,
		eraseStampCommit,
		stampRegionBitmap,
		patchRectSync,
		beginBatch,
		endBatch,
		isBatching,
		markZIndexDirty,
		getZoomLimits,
		getContentBounds: computeContentBounds,
		clearAllObjects,
	};
});
