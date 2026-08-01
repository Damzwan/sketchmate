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
	/** Local view state — never synced, never in the undo stack. */
	visible: boolean;
	/** Local view state — blocks hit-testing, not rendering. */
	locked: boolean;
}

/**
 * `mutable` — solo drawing: add / delete / reorder / rename, all undoable.
 * `fixed`   — any room: a constant, deterministic set every peer derives
 *             locally, so no layer document is ever synced and the server's
 *             spread-and-replay buffer needs no new action type.
 */
export type LayerPolicy = "mutable" | "fixed";

/** Ids are constants so peers agree without exchanging a single message. */
export const FIXED_ROOM_LAYERS: readonly DrawLayer[] = [
	{ id: "l0", name: "Background", visible: true, locked: false },
	{ id: "l1", name: "Base", visible: true, locked: false },
	{ id: "l2", name: "Detail", visible: true, locked: false },
	{ id: "l3", name: "Top", visible: true, locked: false },
];

/**
 * Caps the solo layer count. Every hide/show toggle invalidates that layer's
 * content footprint, and the sheet is a flat list — both stay cheap only while
 * the count is small.
 */
export const MAX_SOLO_LAYERS = 8;

export function createLayer(id: string, name: string): DrawLayer {
	return { id, name, visible: true, locked: false };
}

export function defaultSoloLayers(): DrawLayer[] {
	return [createLayer(BASE_LAYER_ID, "Layer 1")];
}
