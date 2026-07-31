import type { FabricObject } from "fabric";
import type { WorldRect } from "../../rendering/committedLayer";
import {
	fabricObjectToEntry,
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

export function createDrawingSpatialIndex(
	objectMap: Map<string, FabricObject>,
	zIndex: ExplicitZIndex,
) {
	const quadtree = new InfiniteQuadtreeManager<FabricObject>();
	const entryMap = new Map<string, QuadtreeEntry<FabricObject>>();

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

	function clearSpatialIndex(): void {
		entryMap.clear();
		quadtree.clear();
	}

	function queryObjects(rect: WorldRect): FabricObject[] {
		return quadtree
			.query(rect)
			.map((entry) => objectMap.get(entry.id))
			.filter(Boolean) as FabricObject[];
	}

	return {
		spatialIndex,
		queryObjects,
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
