import { Canvas, CanvasEvents, FabricImage, FabricObject } from 'fabric'


export interface ToolService {
  select: () => void
  events: FabricEvent[]
  init: (c: Canvas) => void
}

export interface SelectToolOptions {
  e?: Event
  skipOpenMenu?: boolean
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
  SetPropertiesOfObject,
  CopyObject,
  AddText,
  Merge,
  RemoveSelectedObjects,
  ChangeFont,
  SetObjectFillColor,
  SetObjectBackgroundColor,
  SetObjectStrokeColor,
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
  SaveFabricObject,
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

export interface DrawActionObjectParams {
  objects: FabricObject[]
}

export type DrawActionParams = {
  [DrawAction.FullErase]: undefined;
  [DrawAction.SetPropertiesOfObject]: DrawActionObjectParams & { properties: any };
  [DrawAction.CopyObject]: DrawActionObjectParams;
  [DrawAction.AddText]: undefined;
  [DrawAction.Merge]: DrawActionObjectParams;
  [DrawAction.RemoveSelectedObjects]: undefined;
  [DrawAction.ChangeFont]: {font: string};
  [DrawAction.SetObjectFillColor]: { color: string | undefined };
  [DrawAction.SetObjectBackgroundColor]: { color: string | undefined };
  [DrawAction.SetObjectStrokeColor]: { color: string  | undefined};
  [DrawAction.ChangeFontWeight]: {weight: string};
  [DrawAction.ChangeFontStyle]: {fontStyle: string};
  [DrawAction.ChangeTextAlign]: {align: string};
  [DrawAction.MoveObjectToFront]: DrawActionObjectParams;
  [DrawAction.MoveObjectToBack]: DrawActionObjectParams;
  [DrawAction.MoveObjectUpOneLayer]: DrawActionObjectParams;
  [DrawAction.MoveObjectDownOneLayer]: DrawActionObjectParams;
  [DrawAction.SetCanvasBackground]: { color: string };
  [DrawAction.ChangeStrokeWidth]: {strokeWidth: number};
  [DrawAction.FlipX]: DrawActionObjectParams;
  [DrawAction.FlipY]: DrawActionObjectParams;
  [DrawAction.Undo]: undefined;
  [DrawAction.Redo]: undefined;
  [DrawAction.UnselectObjects]: undefined;
  [DrawAction.ExitColorPickerMode]: { lastSelectedObjectRef?: FabricObject };
  [DrawAction.ExitTextAddingMode]: undefined;
  [DrawAction.AddImage]: { imageUrl: string };
  [DrawAction.AddSavedDrawingToCanvas]: DrawActionObjectParams & { json: any };
  [DrawAction.SaveFabricObject]: DrawActionObjectParams;
  [DrawAction.AddShape]: {shape: Shape};
  [DrawAction.ConfirmShapeCreation]: undefined;
  [DrawAction.AddImgFilter]: { filter: any; image: FabricImage; remove: boolean };
};

