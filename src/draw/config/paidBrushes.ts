import { buildItemId } from "@/config/catalog.config";
import { BrushType } from "@/draw/tools/tool.types";

/**
 * Brushes that are shop items, and the item they map to.
 *
 * Kept in its own module rather than in `tools.config`: that file constructs
 * every brush class, so anything importing it pulls the whole fabric brush set
 * into its bundle. The pen menu, the pen store and the trial gate all need this
 * mapping and none of them should pay for that.
 */
export const PAID_BRUSH_ITEM_IDS: Partial<Record<BrushType, string>> = {
	[BrushType.Neon]: buildItemId("brush", "neon"),
	[BrushType.CalliGraphy]: buildItemId("brush", "calligraphy"),
};

/** The shop item gating this brush, or null when it is free for everyone. */
export const brushItemId = (type: BrushType): string | null =>
	PAID_BRUSH_ITEM_IDS[type] ?? null;

export const BRUSH_DISPLAY_NAMES: Partial<Record<BrushType, string>> = {
	[BrushType.Neon]: "Neon Pen",
	[BrushType.CalliGraphy]: "Calligraphy",
};

export const brushDisplayName = (type: BrushType): string =>
	BRUSH_DISPLAY_NAMES[type] ?? "Brush";
