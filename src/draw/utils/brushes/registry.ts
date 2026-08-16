import { classRegistry } from "fabric";
import { BucketFillPath } from "@/draw/utils/BucketFillPath";
import { CalligraphyStroke } from "@/draw/utils/brushes/CalligraphyBrush";
import { CharcoalStroke } from "@/draw/utils/brushes/CharcoalBrush";
import { CrayonStroke } from "@/draw/utils/brushes/CrayonBrush";
import { CircleStroke } from "@/draw/utils/brushes/CustomCircleBrush";
import { OptimizedEraserStroke } from "@/draw/utils/brushes/CustomEraserBrush";
import { OptimizedPencilStroke } from "@/draw/utils/brushes/CustomPencilBrush";
import { SprayStroke } from "@/draw/utils/brushes/CustomSprayBrush";
import { NeonStroke } from "@/draw/utils/brushes/NeonSignBrush";
import { PixelStroke } from "@/draw/utils/brushes/PixelBrush";
import { SmudgeStroke } from "@/draw/utils/brushes/SmudgeBrush";
import { WaterColorStroke } from "@/draw/utils/brushes/WaterColorBrush";

/**
 * Every custom drawable that may cross a Fabric JSON boundary. Main-thread
 * canvases and workers must use this same list: missing a worker registration
 * makes a valid stroke disappear when a document is previewed or baked.
 */
export const BRUSH_REGISTRY = [
	[OptimizedEraserStroke, "OptimizedEraserStroke"],
	[PixelStroke, "PixelStroke"],
	[CharcoalStroke, "CharcoalStroke"],
	[WaterColorStroke, "WaterColorStroke"],
	[CalligraphyStroke, "CalligraphyStroke"],
	[BucketFillPath, "BucketFillPath"],
	[OptimizedPencilStroke, "OptimizedPencilStroke"],
	[NeonStroke, NeonStroke.type],
	[SprayStroke, SprayStroke.type],
	[CircleStroke, CircleStroke.type],
	[CrayonStroke, CrayonStroke.type],
	[SmudgeStroke, SmudgeStroke.type],
] as const;

export function registerBrushClasses(): void {
	for (const [drawableClass, name] of BRUSH_REGISTRY) {
		classRegistry.setClass(drawableClass, name);
	}
}
