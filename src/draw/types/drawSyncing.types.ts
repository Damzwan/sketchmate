import { HistoryAction } from '@/draw/types/drawHistory.types'
import { FabricObjectProps } from 'fabric'

export enum DrawSyncingEvent {
  added = 'added',
  removed = 'removed',
  modified = 'modified',
  fullErase = 'fullErase',
  MoveObjectUpOneLayer = 'moveObjectUpOneLayer',
  MoveObjectDownOneLayer = 'moveObjectDownOneLayer',
  MoveObjectToBack = 'moveObjectToBack',
  MoveObjectToFront = 'moveObjectToFront',
  FlipX = 'FlipX',
  FlipY = 'FlipY',
  ObjectsCopied = 'ObjectsCopied',
  BackgroundColorChanged = 'BackgroundColorChanged',
  TextStyleChanged = 'TextStyleChanged',
  ObjectStyleChanged = 'ObjectStyleChanged',
  ImgFilterChanged = 'ImgFilterChanged',
  Undo = 'Undo',
  Redo = 'Redo',
  ObjectsMerged = 'ObjectsMerged',
  ErasingEnd = 'ErasingEnd',
}

export type DrawSyncingMap = {
  [DrawSyncingEvent.added]: { objectJSONS: any[] }
  [DrawSyncingEvent.removed]: { objectIds: string[] }
  [DrawSyncingEvent.modified]: {
    changes: { id: string, forward: Partial<FabricObjectProps>, backward: Partial<FabricObjectProps> }[]
  },
  [DrawSyncingEvent.fullErase]: undefined,
  [DrawSyncingEvent.MoveObjectUpOneLayer]: { objectIds: string[] },
  [DrawSyncingEvent.MoveObjectDownOneLayer]: { objectIds: string[] },
  [DrawSyncingEvent.MoveObjectToFront]: { objectIds: string[] },
  [DrawSyncingEvent.MoveObjectToBack]: { objectIds: string[] },
  [DrawSyncingEvent.FlipX]: { objectIds: string[] },
  [DrawSyncingEvent.FlipY]: { objectIds: string[] },
  [DrawSyncingEvent.ObjectsCopied]: { objectsJSON: any },
  [DrawSyncingEvent.BackgroundColorChanged]: { color: string },
  [DrawSyncingEvent.TextStyleChanged]: { style: any, objectId: string },
  [DrawSyncingEvent.ObjectStyleChanged]: { style: any, objectIds: string[] },
  [DrawSyncingEvent.ImgFilterChanged]: { filter: any, objectId: string },
  [DrawSyncingEvent.Undo]: HistoryAction,
  [DrawSyncingEvent.Redo]: HistoryAction,
  [DrawSyncingEvent.ObjectsMerged]: { mergedObjectIds: string[], groupId: string },
  [DrawSyncingEvent.ErasingEnd]: { objectIds: string[], clipPaths: string[] },
}


export type DrawSyncingParams<T extends DrawSyncingEvent> = DrawSyncingMap[T]

export interface DrawSyncingAction<T extends DrawSyncingEvent = DrawSyncingEvent> {
  type: T
  params: DrawSyncingParams<T>
}