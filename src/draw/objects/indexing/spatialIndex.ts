import type { FabricObject } from "fabric";
import type { WorldRect } from "../../rendering/committedLayer";
import {
	InfiniteQuadtreeManager,
	type QuadtreeEntry,
} from "../../utils/QuadTree";
import {
	bakeryClipSet,
	bakeryMarkDirty,
	bakeryZOrder,
} from "../../rendering/bakery/tileBakeryClient";
import type { ExplicitZIndex } from "./zIndex";
import { markObjectMutated } from "../objectSerialization";
import { BASE_LAYER_ID } from "@/draw/layers/layer.types";
import {
	activeLayerId,
	compareRenderOrder,
	hasHiddenLayers,
	hasLockedLayers,
	isLayerHidden,
	isLayerLocked,
	layerCount,
	layerOrderOf,
} from "@/draw/layers/layerRegistry";

export function createDrawingSpatialIndex(
	objectMap: Map<string, FabricObject>,
	zIndex: ExplicitZIndex,
) {
	const quadtree = new InfiniteQuadtreeManager<FabricObject>();
	const entryMap = new Map<string, QuadtreeEntry<FabricObject>>();

	/**
	 * Reusable buffers for the quadtree's raw hit list.
	 *
	 * Every query allocated TWO arrays: the entries from the quadtree, and the
	 * objects built from them. In `main` backend mode a query runs per tile bake,
	 * per synchronous repair, per region repair and per overview patch, so a
	 * single bake pass allocated dozens of them (see
	 * docs/DRAW_ENGINE_MAINTHREAD_REVIEW.md → M6). The entry list never escapes
	 * the function that fills it, so it can be reused; the OBJECT array cannot be
	 * — the async bake holds it across yields — and is still allocated fresh.
	 *
	 * A small stack rather than one buffer: nothing nests these today, but a
	 * future caller that queries inside a query would otherwise silently corrupt
	 * the outer result, and that failure would look like missing tile content
	 * rather than like an aliasing bug.
	 */
	const entryScratch: QuadtreeEntry<FabricObject>[][] = [];
	let scratchDepth = 0;

	function takeScratch(): QuadtreeEntry<FabricObject>[] {
		const buffer = (entryScratch[scratchDepth] ??= []);
		scratchDepth++;
		return buffer;
	}

	function releaseScratch(): void {
		scratchDepth--;
	}

	// ── spatial index handed to the renderer (z-sorted query) ────────────────
	//
	// LAYERS ENTER HERE AND (almost) NOWHERE ELSE. Tiles, the overview, the live
	// layer and the sync/history repair paths all funnel through these two
	// functions, so filtering a hidden layer here is what makes every surface
	// agree. Doing it per-consumer instead is how a hidden stroke survives in the
	// overview but not the tiles.
	//
	// The hidden check is guarded by `hasHiddenLayers()` — a Set size read — so
	// the overwhelmingly common case (nothing hidden) pays nothing per object.
	//
	// `__lo` (the layer rank the sort reads) is refreshed in the SAME loop that
	// already visits each object. One Map lookup per object per query, versus
	// making correctness depend on every path that can change an object's layer
	// remembering to invalidate a cached stamp — an undo of a layer move goes
	// through generic style-restore code that knows nothing about layers.
	const spatialIndex = {
		query: (rect: WorldRect): FabricObject[] => {
			getZIndexMap(); // ensure __z / __lo stamps are current
			const entries = quadtree.query(rect, takeScratch());
			const objs: FabricObject[] = [];
			const filterHidden = hasHiddenLayers();
			try {
				for (let i = 0; i < entries.length; i++) {
					const o = objectMap.get(entries[i].id);
					if (!o) continue;
					const a = o as any;
					if (filterHidden && isLayerHidden(a.layerId)) continue;
					a.__lo = layerOrderOf(a.layerId);
					objs.push(o);
				}
			} finally {
				releaseScratch();
			}
			// A tile query returning one object is the common case on a sparse
			// board, and Array.prototype.sort still allocates and calls into the
			// comparator machinery for it.
			return objs.length > 1 ? objs.sort(compareRenderOrder) : objs;
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
			// NOT the scratch buffer: the returned pairs alias `entries[i].bounds`,
			// which is the LIVE entry rect, and the overview holds the result across
			// yields. Reusing the buffer here is safe today only because nothing
			// re-queries during that window — too fragile to rely on for a caller
			// that is explicitly documented as long-lived.
			const entries = quadtree.query(rect);
			const out: { obj: FabricObject; bounds: WorldRect }[] = [];
			const filterHidden = hasHiddenLayers();
			for (let i = 0; i < entries.length; i++) {
				const o = objectMap.get(entries[i].id);
				if (!o) continue;
				const a = o as any;
				if (filterHidden && isLayerHidden(a.layerId)) continue;
				a.__lo = layerOrderOf(a.layerId);
				out.push({ obj: o, bounds: entries[i].bounds });
			}
			return out.sort((a, b) => compareRenderOrder(a.obj, b.obj));
		},
	};

	// ── geometry / index helpers ─────────────────────────────────────────────
	function boundsSig(obj: FabricObject): string {
		const a = obj as any;
		const g = obj.group as any; // <-- Check for parent group (ActiveSelection)

		let sig =
			`${a.left},${a.top},${a.scaleX},${a.scaleY},${a.angle},` +
			`${a.skewX},${a.skewY},${a.flipX},${a.flipY},` +
			`${a.width},${a.height},${a.strokeWidth}`;

		// Text re-lays-out on any of these, and width/height only catch it AFTER
		// fabric's initDimensions has run. Signing the layout inputs themselves
		// means an edit is detected even when the re-measure is deferred or was
		// skipped — the difference between "stale cache heals" and "the old
		// glyphs stay baked into the tiles as artifacts".
		if (a.text !== undefined) {
			sig +=
				`,${a.text.length},${a.fontFamily},${a.fontSize},${a.fontWeight},` +
				`${a.fontStyle},${a.textAlign},${a.lineHeight},${a.charSpacing}`;
		}

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
		return zIndex.objectMap;
	}

	function zGet(ids: string[]): number[] {
		return zIndex.get(ids);
	}

	function zRestore(ids: string[], zs: number[]): void {
		zIndex.restore(ids, zs);
		getZIndexMap();
		bakeryZOrder(ids, zIndex.get(ids));
	}

	function zToFront(ids: string[]): void {
		zIndex.toFront(ids);
		getZIndexMap();
		bakeryZOrder(ids, zIndex.get(ids));
	}

	function zToBack(ids: string[]): void {
		zIndex.toBack(ids);
		getZIndexMap();
		bakeryZOrder(ids, zIndex.get(ids));
	}

	function zUpOne(ids: string[]): void {
		zIndex.upOne(ids);
		getZIndexMap();
		bakeryZOrder(ids, zIndex.get(ids));
	}

	function zDownOne(ids: string[]): void {
		zIndex.downOne(ids);
		getZIndexMap();
		bakeryZOrder(ids, zIndex.get(ids));
	}

	function invalidateZIndex() {
		zIndex.invalidate();
	}

	function markZIndexDirty() {
		zIndex.invalidate();
	}

	function addToQuadTree(obj: FabricObject) {
		// Registration is required to be idempotent. A stale entry is otherwise
		// still returned by quadtree queries even though entryMap points at the new
		// one, making the renderer rasterize one logical object multiple times.
		const previous = entryMap.get(obj.id);
		if (previous) quadtree.remove(previous);
		// Seed the bounds CACHE, not just the entry. `staleBounds` is the only
		// record of an object's pre-edit footprint on the style-change path, and it
		// answers null when the cache was never built — so a font/text edit on an
		// object that had never been measured invalidated only its NEW (possibly
		// smaller) rect and left the old glyphs baked in the tiles.
		const b = cachedBounds(obj);
		const e: QuadtreeEntry<FabricObject> = {
			id: obj.id,
			// Copy: updateQuadTree mutates entry bounds in place, and the cache entry
			// must stay an accurate record of what was last measured.
			bounds: { x: b.x, y: b.y, w: b.w, h: b.h },
		};
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
		markObjectMutated(obj);
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
		markObjectMutated(obj);
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
		markObjectMutated(obj);
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
		quadtree.translate(e, dx, dy);
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
			// ALWAYS restore the old string, never "only when it was longer".
			// Character count is not width: "wwww" → "iiiiiiii" grows in length and
			// SHRINKS in pixels, and a wrapped edit can lose width while gaining
			// height. Measuring the current text in those cases reported a footprint
			// smaller than the one actually painted, so the vacated pixels were never
			// invalidated and the old glyphs survived in the tiles.
			if (isTextChanged) o.set({ text: oldText });
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
		} finally {
			// One edit, one rewind. Left in place it makes EVERY later modify of this
			// object (a drag, a resize) rewind to text it no longer has, producing a
			// bogus "old" rect and re-laying-out the glyphs twice per gesture.
			if (isTextChanged) delete (o as any)._textBeforeEdit;
		}
	}

	function clearSpatialIndex(): void {
		entryMap.clear();
		quadtree.clear();
	}

	/**
	 * Unsorted region query, HIDDEN LAYERS EXCLUDED — the safe default. Callers
	 * that paint (the vacated-region painter, the eraser's protect mask, bucket
	 * fill) and callers that pick (below) must both ignore a hidden layer, so
	 * hiding is the default and seeing everything is the explicit opt-in.
	 */
	function queryObjects(rect: WorldRect): FabricObject[] {
		const entries = quadtree.query(rect, takeScratch());
		const out: FabricObject[] = [];
		const filterHidden = hasHiddenLayers();
		try {
			for (let i = 0; i < entries.length; i++) {
				const o = objectMap.get(entries[i].id);
				if (!o) continue;
				const a = o as any;
				if (filterHidden && isLayerHidden(a.layerId)) continue;
				a.__lo = layerOrderOf(a.layerId);
				out.push(o);
			}
		} finally {
			releaseScratch();
		}
		return out;
	}

	/**
	 * Every object in the region regardless of layer state. For bookkeeping that
	 * must not depend on what the user is currently looking at: erase-undo repair
	 * (an erase can be undone after its layer was hidden) and claimed-area
	 * enforcement (a hidden object still occupies the area).
	 */
	function queryObjectsRaw(rect: WorldRect): FabricObject[] {
		return quadtree
			.query(rect)
			.map((entry) => objectMap.get(entry.id))
			.filter(Boolean) as FabricObject[];
	}

	/** Hit-testing: hidden AND locked layers are untouchable. */
	function queryInteractiveObjects(rect: WorldRect): FabricObject[] {
		const objs = queryObjects(rect);
		if (!hasLockedLayers()) return objs;
		return objs.filter((o) => !isLayerLocked((o as any).layerId));
	}

	/**
	 * SELECTION targets — the active layer only, the standard layer-editor rule
	 * ("you edit the layer you are on"). Without it, tapping picks whatever is
	 * under the finger and the active layer stops meaning anything for every
	 * operation except drawing.
	 *
	 * Single-layer drawings (every legacy document, and most new ones) skip the
	 * filter entirely, so this changes nothing for them.
	 */
	function querySelectableObjects(rect: WorldRect): FabricObject[] {
		const objs = queryInteractiveObjects(rect);
		if (layerCount() < 2) return objs;
		const active = activeLayerId();
		return objs.filter((o) => ((o as any).layerId ?? BASE_LAYER_ID) === active);
	}

	/**
	 * World footprint of one layer's contents, read off the quadtree ENTRIES so
	 * it stays correct for objects that aren't hydrated on the fabric canvas.
	 *
	 * This is what keeps a visibility toggle cheap: instead of dropping the whole
	 * tile cache, the engine invalidates only the region the layer actually
	 * covers. O(scene) once per toggle — a deliberate, user-initiated action —
	 * versus O(scene) per frame if we got it wrong.
	 */
	function layerContentBounds(layerId: string): WorldRect | null {
		let x0 = Infinity,
			y0 = Infinity,
			x1 = -Infinity,
			y1 = -Infinity;
		for (const [id, entry] of entryMap) {
			const obj = objectMap.get(id);
			if (!obj) continue;
			const objLayer = (obj as any).layerId ?? BASE_LAYER_ID;
			if (objLayer !== layerId) continue;
			const b = entry.bounds;
			if (!isFinite(b.x) || b.w <= 0 || b.h <= 0) continue;
			x0 = Math.min(x0, b.x);
			y0 = Math.min(y0, b.y);
			x1 = Math.max(x1, b.x + b.w);
			y1 = Math.max(y1, b.y + b.h);
		}
		if (!isFinite(x0)) return null;
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	}

	function objectIdsOnLayer(layerId: string): string[] {
		const ids: string[] = [];
		for (const [id, obj] of objectMap) {
			if (((obj as any).layerId ?? BASE_LAYER_ID) === layerId) ids.push(id);
		}
		return ids;
	}

	return {
		spatialIndex,
		queryObjects,
		queryObjectsRaw,
		queryInteractiveObjects,
		querySelectableObjects,
		layerContentBounds,
		objectIdsOnLayer,
		clearSpatialIndex,
		addToQuadTree,
		removeFromQuadTree,
		updateQuadTree,
		clipChanged,
		offsetQuadTree,
		computeContentBounds,
		collectOldRect,
		objectBounds,
		staleBounds,
		unionRect,
		getZIndexMap,
		zGet,
		zRestore,
		zToFront,
		zToBack,
		zUpOne,
		zDownOne,
		invalidateZIndex,
		markZIndexDirty,
	};
}
