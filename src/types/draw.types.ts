import { fabric } from 'fabric'
import { Canvas } from 'fabric/fabric-impl'
import { Ref } from 'vue'

export type SelectedObject = fabric.Object | fabric.Group

export interface SelectToolOptions {
  e: Event
  openMenu: boolean
}

export interface ToolService {
  select: (c: Canvas) => void
  events: FabricEvent[]
}

export interface FabricEvent {
  on: string
  type: DrawEvent
  handler: (e: any) => void
}

export enum DrawTool {
  Pen,
  MobileEraser,
  HealingEraser,
  Select
}

export enum DrawAction {
  FullErase,
  Sticker,
  CopyObject,
  BackgroundImage,
  AddShape,
  AddText,
  Merge,
  CreateSaved,
  AddSavedToCanvas,
  Delete,
  ChangeFont,
  ChangeFillColour,
  ChangeBackgroundColor,
  ChangeStrokeColour,
  ChangeFontWeight,
  ChangeFontStyle,
  ChangeTextAlign,
  CurveText
}

export enum Menu {
  Pen,
  Eraser,
  Bucket,
  Sticker,
  Saved,
  Shapes
}

export enum ObjectType {
  path = 'path',
  image = 'image',
  text = 'i-text'
}

export type Eraser = DrawTool.MobileEraser | DrawTool.HealingEraser
export type Pen = DrawTool.Pen

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

export enum Layer {
  background,
  obj,
  text
}

export enum DrawEvent {
  SetSelectedObjects = 'set selected objects',
  AddObjectIdOnCreated = 'add id on object creation',
  SaveHistory = 'save history',
  Gesture = 'gesture',
  BucketFill = 'on click with bucket',
  ShapeCreation = 'Creating shape',
  SetModified = 'Creating shape'
}
