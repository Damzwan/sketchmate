import type { Canvas, CanvasEvents } from 'fabric'


export interface ToolService {
  select: () => void
  events: FabricEvent[]
  init: (c: Canvas) => void
}

export interface SelectToolOptions {
  e?: Event
  openMenu?: boolean
  init?: boolean
}


export interface FabricEvent {
  on: keyof CanvasEvents
  handler: (e: any) => void
}

export enum DrawTool {
  Pen,
  MobileEraser,
  Select,
  Lasso,
  Bucket,
  Pan
}

export enum DrawAction {
  FullErase,
  AddObject,
  RemoveObjectsByID,
  TransformObject,
  SetPropertiesOfObject,
  CopyObject,
  AddText,
  Merge,
  RemoveSelectedObjects,
  ChangeFont,
  SetFillColor,
  SetBackgroundColor,
  SetStrokeColor,
  ChangeFontWeight,
  ChangeFontStyle,
  ChangeTextAlign,
  MoveObjectToFront,
  MoveObjectToBack,
  MoveObjectUpOneLayer,
  MoveObjectDownOneLayer,
  SetCanvasBackground,
  ChangeStrokeWidth,
  FlipX,
  FlipY,
  Undo,
  Redo,
  UnselectObjects,
  ExitColorPickerMode,
  ExitTextAddingMode,
  AddImage,
  AddSavedDrawingToCanvas,
  saveFabricObject,
  AddShape,
  ConfirmShapeCreation,
  AddImgFilter,
}

export enum Menu {
  Pen,
  Eraser,
  StickerEmblemSaved,
  Shapes,
  Cropper,
  Select,
  Send,
  MoreTools,
  SelectMoreOptions,
  SelectColor,
  Font,
  Text,
  SelectImgStyle,
  FeedbackMenu,
  HelpMenu,
  ReceiveBalloon,
  SendBalloon,
  DateOfBirth,
}

export enum ObjectType {
  path = 'path',
  image = 'image',
  text = 'i-text',
  group = 'group',
  selection = 'activeSelection',
  polygon = 'polygon'
}

export type Eraser = DrawTool.MobileEraser
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
  small = 20,
  medium = 40,
  large = 60
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
  AddText = 'Click to add text',
  Video = 'video'
}

export type StickersEmblemsSavedTabOptions = 'sticker' | 'emblem' | 'saved'
