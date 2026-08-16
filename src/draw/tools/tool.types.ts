import type { Canvas } from "fabric";
import type { FabricEvent } from "@/draw/canvas/fabricEvent.types";

export interface ToolService {
	select: () => void;
	events: FabricEvent[];
	init: (canvas: Canvas) => void;
	destroy?: () => void;
}

export enum DrawTool {
	Pen,
	MobileEraser,
	Select,
	Lasso,
	Bucket,
	Smudge,
}

export type Eraser = DrawTool.MobileEraser;
/**
 * Tools that share the dock's pen slot. The slot renders whichever of them was
 * used last, so smudge gets a real tool without a new toolbar button.
 */
export type PenMenuTool = DrawTool.Pen | DrawTool.Bucket | DrawTool.Smudge;
export type SelectTool = DrawTool.Select | DrawTool.Lasso;

export enum Shape {
	Circle = "circle",
	Ellipse = "ellipse",
	Rectangle = "rectangle",
	Triangle = "triangle",
	Line = "line",
	Polyline = "polyline",
	Polygon = "polygon",
	HEART = "heart",
}

export enum BrushType {
	Pencil = "pencil",
	Circle = "circle",
	WaterColor = "water_color",
	Spray = "spray",
	Crayon = "crayon",
	Charcoal = "charcoal",
	Pixel = "pixel",
	Neon = "neon",
	CalliGraphy = "calligraphy",
}

/**
 * What the smudge brush does to the pixels it passes over.
 *
 * Three verbs rather than one slider: the same gesture means "drag this colour
 * somewhere else" (Pull), "make this edge stop being an edge" (Blur) and "mix
 * whatever is under me into one colour" (Blend), and no single parameter can
 * express all three.
 */
export enum SmudgeMode {
	/** Classic finger-paint: colour is carried along the stroke. */
	Pull = "pull",
	/** Softens what is already there without moving it. */
	Blur = "blur",
	/** Averages the colours under the tip and paints that average back. */
	Blend = "blend",
}

export enum EraserSize {
	small = 20,
	medium = 40,
	large = 60,
}

export enum ShapeCreationMode {
	Drag,
	Click,
}

export enum TextAlign {
	left = "left",
	center = "center",
	right = "right",
}
