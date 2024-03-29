import { fabric } from 'fabric'
import { Canvas } from 'fabric/fabric-impl'

// We extend the original fabric js interfaces
declare module 'fabric' {
  namespace fabric {
    interface Canvas {
      _rotateObjectByAngle?: () => void
      _scaleObjectBy?: () => void
    }

    interface IText {
      isCurved?: boolean
      originalTop?: number
      mouseUpHandler: (o: any) => void
      init: boolean
    }

    interface IRectOptions {
      erasable?: boolean
    }

    interface Object {
      id: string
      _setOriginToCenter: () => void
      _resetOrigin: () => void
      visual?: boolean
      edit?: boolean
      isCreating?: false
      eraser: any
      backgroundObject: boolean // indicates that we should not color this object since it acts as a background color
      bucketFillObject?: boolean // used in order to move the newly created background fill to the right location
    }

    interface PatternBrush {
      source: any
    }

    interface Path {
      originalLeft: number
      originalTop: number
    }

    interface Control {
      pointIndex: number
    }
  }
}

export type SelectedObject = fabric.Object | fabric.Group

export interface SelectToolOptions {
  e?: Event
  openMenu?: boolean
  init?: boolean
}

export interface ToolService {
  select: (c: Canvas) => void
  events: FabricEvent[]
  init: (c: Canvas) => void
  destroy: () => void
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
  Select,
  Lasso,
  Bucket
}

export enum DrawAction {
  FullErase,
  Sticker,
  CopyObject,
  AddBackgroundImage,
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
  BringToBack,
  MoveUpOneLayer,
  MoveDownOneLayer,
  EditPolygon,
  SetCanvasBackground,
  ChangeStrokeWidth,
  AddImgFilter,
  Flip
}

export enum Menu {
  Pen,
  Eraser,
  StickerEmblemSaved,
  Shapes,
  Cropper,
  Select
}

export enum ObjectType {
  path = 'path',
  image = 'image',
  text = 'i-text',
  group = 'group',
  selection = 'activeSelection',
  polygon = 'polygon'
}

export type Eraser = DrawTool.MobileEraser | DrawTool.HealingEraser
export type PenMenuTool = DrawTool.Pen | DrawTool.Bucket
export type SelectTool = DrawTool.Select | DrawTool.Lasso

export enum Shape {
  Circle = 'circle',
  Ellipse = 'ellipse',
  Rectangle = 'rectangle',
  Triangle = 'triangle',
  Line = 'line',
  Polyline = 'polyline',
  Polygon = 'polygon',
  HEART = 'heart'
}

export enum BrushType {
  Pencil,
  Circle,
  WaterColor,
  Ink,
  Spray
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
  SaveHistory = 'save history',
  Gesture = 'gesture',
  BucketFill = 'on click with bucket',
  ShapeCreation = 'Creating shape',
  SetModified = 'Set Modified',
  Lasso = 'Using lasso',
  ColorPicker = 'Color picker',
  AddText = 'Click to add text'
}

export type StickersEmblemsSavedTabOptions = 'sticker' | 'emblem' | 'saved'
