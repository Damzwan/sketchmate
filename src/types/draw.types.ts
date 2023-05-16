export enum DrawTool {
  Pen,
  MobileEraser,
  HealingEraser,
  Select,
  Move,
  Bucket
  // StrokeEraser
  // Drag
}

export type Eraser = DrawTool.MobileEraser | DrawTool.HealingEraser
export type Pen = DrawTool.Pen

export enum DrawAction {
  FullErase,
  Sticker,
  FillBackground,
  CopyObject,
  BackgroundImage
  // Text
}

export enum BrushType {
  Pencil,
  Circle,
  Spray
}

export enum EraserSize {
  small = 10,
  medium = 20,
  large = 30
}

export interface Point {
  x: number
  y: number
}
