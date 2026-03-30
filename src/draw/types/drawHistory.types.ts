import { FabricObjectProps } from 'fabric'

export enum HistoryEvent {
  ObjectAdded = 'object:added',
  ObjectsAdded = 'objects:added',
  ObjectsDeleted = 'objectsDeleted',
  ObjectModified = 'object:modified',
  Erasing = 'erasing',
  FullErase = 'fullErase',
  MoveObjectToFront = 'moveObjectToFront',
  MoveObjectToBack = 'moveObjectToBack',
  MoveObjectUpOneLayer = 'moveObjectUpOneLayer',
  MoveObjectDownOneLayer = 'moveObjectDownOneLayer',
  FlipX = 'flipX',
  FlipY = 'flipY',
  ObjectsCopied = 'objectsCopied',
  BackgroundColorChanged = 'backgroundColorChanged',
  TextChanged = 'textChanged',
  TextStyleChanged = 'textStyleChanged',
  PolygonCreation = 'polygonCreation',
  ObjectStyleChanged = 'objectStyleChanged',
  ImgFilterChanged = 'imgFilterChanged',
  Merge = 'merge',
}


export type HistoryParamsMap = {
  [HistoryEvent.ObjectAdded]: { objectJSON: any }
  [HistoryEvent.ObjectsAdded]: { objectsJSON: any[] }
  [HistoryEvent.ObjectsDeleted]: { objectsJSON: any[] }
  [HistoryEvent.ObjectModified]: {
    activeObjectId?: string | null
    changes: { id: string, forward: Partial<FabricObjectProps>, backward: Partial<FabricObjectProps> }[]
  }
  [HistoryEvent.Erasing]: { objectIds: string[], strokeId: string, strokeJSON: any }
  [HistoryEvent.FullErase]: { prevCanvasJSON: any }
  [HistoryEvent.MoveObjectToFront]: { objectIds: string[]; prevObjectPositions: number[] }
  [HistoryEvent.MoveObjectToBack]: { objectIds: string[]; prevObjectPositions: number[] }
  [HistoryEvent.MoveObjectUpOneLayer]: { objectIds: string[]; prevObjectPositions: number[] }
  [HistoryEvent.MoveObjectDownOneLayer]: { objectIds: string[]; prevObjectPositions: number[] }
  [HistoryEvent.FlipX]: { objectIds: string[] }
  [HistoryEvent.FlipY]: { objectIds: string[] }
  [HistoryEvent.ObjectsCopied]: { objectsJSON: any[] }
  [HistoryEvent.BackgroundColorChanged]: { previousColor: string }
  [HistoryEvent.TextChanged]: { objectId: string; prevText: string; newText: string }
  [HistoryEvent.TextStyleChanged]: { objectId: string; prevStyle: any; newStyle: any }
  [HistoryEvent.PolygonCreation]: { lastPoint: any }
  [HistoryEvent.ObjectStyleChanged]: {
    objectIds: string[];
    prevStyles: Record<string, any>;
    newStyles: Record<string, any> | null
  }
  [HistoryEvent.ImgFilterChanged]: { objectId: string; prevFilter: any; newFilter: any, prevBlendColorFilter: any }
  [HistoryEvent.Merge]: { group: any | undefined, objectIds: string[] }
}


export type HistoryParams<T extends HistoryEvent> = HistoryParamsMap[T]

export interface HistoryAction<T extends HistoryEvent = HistoryEvent> {
  type: T
  params: HistoryParams<T>
}
