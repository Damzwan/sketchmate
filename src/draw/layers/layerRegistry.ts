import {
	BASE_LAYER_ID,
	byLayerOrder,
	type DrawLayer,
	defaultSoloLayers,
	type LayerPolicy,
} from "@/draw/layers/layer.types";

/**
 * The engine-facing view of the layer set: a plain module, no pinia, no fabric
 * runtime import. Render and hit-test paths run per frame and per pointer move,
 * so they read these maps directly instead of a reactive store.
 *
 * `layers.store.ts` owns mutation and reactivity and pushes state down here.
 */

let layers: DrawLayer[] = defaultSoloLayers();
let orderById = new Map<string, number>([[BASE_LAYER_ID, 0]]);
let hiddenIds = new Set<string>();
let lockedIds = new Set<string>();
let activeId = BASE_LAYER_ID;
let policy: LayerPolicy = "mutable";

type LayoutListener = () => void;
const layoutListeners = new Set<LayoutListener>();

/** Bumped whenever ORDER changes (add / delete / reorder), so consumers holding
 *  a stamped sort key know to restamp. Visibility does not bump it. */
let layoutVersion = 0;

function reindex(): void {
	// Sort by the fractional key, then hand DOWNSTREAM a dense integer rank.
	// `__lo` only ever gets compared, so the rank is all the renderer needs, and
	// keeping the fractional value out of the hot path avoids float compares
	// per object per query.
	layers.sort(byLayerOrder);
	orderById = new Map();
	for (let index = 0; index < layers.length; index++) {
		orderById.set(layers[index].id, index);
	}
	hiddenIds = new Set();
	lockedIds = new Set();
	for (const layer of layers) {
		if (!layer.visible) hiddenIds.add(layer.id);
		if (layer.locked) lockedIds.add(layer.id);
	}
	if (!orderById.has(activeId)) {
		activeId = layers[0]?.id ?? BASE_LAYER_ID;
	}
}

/** Replace the whole set (load, room join, undo of a structural change). */
export function setLayerSet(
	next: readonly DrawLayer[],
	nextPolicy: LayerPolicy,
) {
	layers = next.map((layer) => ({ ...layer }));
	if (layers.length === 0) layers = defaultSoloLayers();
	policy = nextPolicy;
	reindex();
	layoutVersion++;
	for (const listener of layoutListeners) listener();
}

/** Visibility / lock / rename — no order change, so no layout bump. */
export function syncLayerFlags(next: readonly DrawLayer[]) {
	layers = next.map((layer) => ({ ...layer }));
	reindex();
}

export function setActiveLayerId(id: string) {
	if (orderById.has(id)) activeId = id;
}

export function onLayerLayoutChanged(listener: LayoutListener): () => void {
	layoutListeners.add(listener);
	return () => layoutListeners.delete(listener);
}

export function getLayerLayoutVersion(): number {
	return layoutVersion;
}

export function getLayers(): readonly DrawLayer[] {
	return layers;
}

export function getLayerPolicy(): LayerPolicy {
	return policy;
}

export function activeLayerId(): string {
	return activeId;
}

/** Unknown / legacy ids fold into the bottom layer rather than vanishing. */
export function layerOrderOf(layerId: string | undefined): number {
	if (layerId === undefined) return 0;
	return orderById.get(layerId) ?? 0;
}

export function layerCount(): number {
	return layers.length;
}

/** Rank of the topmost layer. Nothing can paint above an object at this rank. */
export function topLayerRank(): number {
	return layers.length - 1;
}

/**
 * Is this object at the top of the RENDER order, i.e. can nothing be painted
 * over it? Only meaningful together with the caller's own canvas-order check —
 * this answers the layer half.
 */
export function isOnTopLayer(layerId: string | undefined): boolean {
	return layerOrderOf(layerId) === layers.length - 1;
}

/**
 * Is this object on the layer being edited? Single-layer documents answer yes
 * to everything, so every active-layer restriction disappears for them.
 */
export function isOnActiveLayer(layerId: string | undefined): boolean {
	if (layers.length < 2) return true;
	return (layerId ?? BASE_LAYER_ID) === activeId;
}

export function hasHiddenLayers(): boolean {
	return hiddenIds.size > 0;
}

export function hasLockedLayers(): boolean {
	return lockedIds.size > 0;
}

export function isLayerHidden(layerId: string | undefined): boolean {
	return hiddenIds.size > 0 && hiddenIds.has(layerId ?? BASE_LAYER_ID);
}

export function isLayerLocked(layerId: string | undefined): boolean {
	return lockedIds.size > 0 && lockedIds.has(layerId ?? BASE_LAYER_ID);
}

/**
 * The canonical paint order: layer first, then the explicit z within it.
 *
 * `__lo` is stamped alongside `__z` by ExplicitZIndex, so this is two numeric
 * reads and at most two subtractions — the same shape as the z-only comparator
 * it replaces. Every consumer that used to sort by z alone must use this, or
 * hit-testing and rendering disagree about what is on top.
 */
export function compareRenderOrder(a: unknown, b: unknown): number {
	const x = a as any;
	const y = b as any;
	const layerDelta = (x.__lo ?? 0) - (y.__lo ?? 0);
	return layerDelta !== 0 ? layerDelta : (x.__z ?? 0) - (y.__z ?? 0);
}

/**
 * Paint order for code that works on a canvas' OBJECT LIST rather than the
 * spatial index: exports, previews and document serialization.
 *
 * Unlike {@link compareRenderOrder} it does not rely on `__lo`/`__z` stamps, so
 * it is also correct for a detached StaticCanvas rebuilt from saved JSON. An
 * unknown layer ranks 0 and a missing `__z` compares equal, so the sort is
 * stable and degrades to the canvas' own order instead of scrambling it.
 */
export function compareDocumentOrder(a: unknown, b: unknown): number {
	const x = a as any;
	const y = b as any;
	const layerDelta = layerOrderOf(x.layerId) - layerOrderOf(y.layerId);
	if (layerDelta !== 0) return layerDelta;
	return typeof x.__z === "number" && typeof y.__z === "number"
		? x.__z - y.__z
		: 0;
}

export function resetLayerRegistry(): void {
	setLayerSet(defaultSoloLayers(), "mutable");
	activeId = BASE_LAYER_ID;
}
