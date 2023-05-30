export enum DrawTool {
  Pen,
  MobileEraser,
  HealingEraser,
  Select
}

export type Eraser = DrawTool.MobileEraser | DrawTool.HealingEraser
export type Pen = DrawTool.Pen

export enum DrawAction {
  FullErase,
  Sticker,
  CopyObject,
  BackgroundImage,
  Bucket,
  Shape,
  Text,
  Saved,
  Merge
  // Text
}

export enum Shape {
  Circle,
  Ellipse,
  Rectangle,
  Triangle,
  Line,
  Polyline,
  Polygon
}

export enum BrushType {
  Pencil,
  Circle,
  Spray,
  Bucket
}

export enum EraserSize {
  small = 10,
  medium = 20,
  large = 30
}

export enum ShapeCreationMode {
  Drag,
  Click
}
