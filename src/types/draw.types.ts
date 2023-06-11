import { fabric } from 'fabric'
import { Canvas } from 'fabric/fabric-impl'

// We extend the original fabric js interfaces
declare module 'fabric' {
  namespace fabric {
    interface IText {
      isCurved?: boolean
    }

    interface Object {
      id: string
    }
  }
}

export type SelectedObject = fabric.Object | fabric.Group

export interface SelectToolOptions {
  e: Event
  openMenu: boolean
}

export interface ToolService {
  select: (c: Canvas) => void
  events: FabricEvent[]
}

export interface RestoreAction {
  description: string
  handler: (e: fabric.Object, c: Canvas) => void
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
  CurveText,
  BringToFront,
  BringToBack
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
  text = 'i-text',
  group = 'group'
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
  Bucket,
  Ink
}

export enum EraserSize {
  small = 10,
  medium = 30,
  large = 50
}

export enum ShapeCreationMode {
  Drag,
  Click
}

export enum TextAlign {
  left = 'left',
  center = 'center',
  right = 'right'
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
