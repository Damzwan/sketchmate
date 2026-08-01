/**
 * Layers are METADATA, not extra render buffers.
 *
 * The engine keeps ONE tiled cache (see docs/DRAW_ENGINE.md). A per-layer tile
 * stack would multiply the single biggest memory consumer on the device class we
 * care about (a 256px mobile tile is ~270 KB; the whole tile budget is 40 MB on
 * a low-end phone), so a layer never owns pixels. It owns:
 *
 *   • an ORDER, which joins the existing explicit z as the primary sort key;
 *   • a VISIBILITY, applied by filtering the spatial-index query — the one
 *     function every renderer, the overview and the live layer all read;
 *   • a LOCK, applied only at interaction query sites.
 *
 * Membership rides on the object as `layerId`, registered in fabric's
 * `customProperties`, so it serializes into drafts, the sync wire, history
 * entries and the worker mirror for free — no new wire message, no server
 * change.
 */

/** Objects saved before layers existed carry no `layerId` and belong here. */
export const BASE_LAYER_ID = "l0";

export interface DrawLayer {
	id: string;
	name: string;
	/**
	 * FRACTIONAL sort key, ascending = bottom to top. Never an array index.
	 *
	 * This is what makes a shared layer document safe without a conflict
	 * resolver. An index-based reorder ("move layer 2 to position 0") means
	 * something different depending on what else has been replayed, so two
	 * peers restructuring at once diverge. A fractional key is absolute: a
	 * reorder states where the layer now sits, a concurrent one states the
	 * same for its own layer, and both converge on a consistent stack. Same
	 * trick `ExplicitZIndex` already uses for objects.
	 */
	order: number;
	/** Local view state — never synced, never in the undo stack. */
	visible: boolean;
	/** Local view state — blocks hit-testing, not rendering. */
	locked: boolean;
}

/**
 * `mutable` — the layer list is editable. Solo it is part of the document;
 *             in a PRIVATE room it is editable and replicated (see LayerOp).
 * `fixed`    — public lobbies: a constant set every peer derives locally, so
 *             nothing is sent, replayed or reconciled. Strangers cannot
 *             restructure a board out from under each other.
 */
export type LayerPolicy = "mutable" | "fixed";

/** Ids are constants so peers agree without exchanging a single message. */
export const FIXED_ROOM_LAYERS: readonly DrawLayer[] = [
	{ id: "l0", name: "Background", order: 0, visible: true, locked: false },
	{ id: "l1", name: "Base", order: 1, visible: true, locked: false },
	{ id: "l2", name: "Detail", order: 2, visible: true, locked: false },
	{ id: "l3", name: "Top", order: 3, visible: true, locked: false },
];

/**
 * Caps the layer count. Every hide/show toggle invalidates that layer's content
 * footprint, and the sheet is a flat list — both stay cheap only while the
 * count is small. In a shared room it also bounds what one peer can inflict on
 * everyone else.
 */
export const MAX_SOLO_LAYERS = 8;

/**
 * A replicated layer-document edit.
 *
 * Every op is IDEMPOTENT and carries no index, so replay order does not change
 * the outcome — which is what removes the need for conflict resolution:
 *
 *   • `add`    — full record including its fractional order. Re-applying is a
 *                no-op; applying to a deleted id is ignored (tombstone).
 *   • `remove` — tombstone by id. The objects on it are deleted by their
 *                originator through the normal object-removal sync, NOT by
 *                this op, so it can never double-delete.
 *   • `rename` / `reorder` — last-writer-wins on `(at, by)`.
 *
 * `at` is the author's clock and is only ever compared against another op for
 * the SAME layer, so clock skew can misorder two near-simultaneous renames and
 * nothing worse. `by` breaks exact ties so every peer picks the same winner.
 */
export type LayerOp =
	| { kind: "add"; layer: DrawLayer; at: number; by: string }
	| { kind: "remove"; id: string; at: number; by: string }
	| { kind: "rename"; id: string; name: string; at: number; by: string }
	| { kind: "reorder"; id: string; order: number; at: number; by: string };

export const MAX_LAYER_NAME = 24;

export function createLayer(
	id: string,
	name: string,
	order: number,
): DrawLayer {
	return { id, name, order, visible: true, locked: false };
}

export function defaultSoloLayers(): DrawLayer[] {
	return [createLayer(BASE_LAYER_ID, "Layer 1", 0)];
}

/** Ascending by order; id breaks ties so every peer sorts identically. */
export function byLayerOrder(a: DrawLayer, b: DrawLayer): number {
	return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * A fractional key placing a layer between two neighbours, or past the end.
 * Midpoints can only be taken so many times before doubles run out of
 * precision; at that point we fall back to a whole step past the neighbour,
 * which is still consistent for everyone because the value itself is what
 * ships.
 */
export function orderBetween(
	below: number | undefined,
	above: number | undefined,
): number {
	if (below === undefined && above === undefined) return 0;
	if (below === undefined) return (above as number) - 1;
	if (above === undefined) return below + 1;
	const mid = (below + above) / 2;
	return mid > below && mid < above ? mid : above;
}
