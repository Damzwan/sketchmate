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
}

export type Eraser = DrawTool.MobileEraser;
export type PenMenuTool = DrawTool.Pen | DrawTool.Bucket;
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
