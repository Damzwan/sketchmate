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
  TextChanged = 'TextChanged'
}

type ShowAvatarActionParams = { creator: string }

export type DrawSyncingMap = {
  [DrawSyncingEvent.added]: ShowAvatarActionParams & { objectJSONS: any[] }
  [DrawSyncingEvent.removed]: ShowAvatarActionParams & { objectIds: string[] }
  [DrawSyncingEvent.modified]: ShowAvatarActionParams & {
    changes: { id: string, forward: Partial<FabricObjectProps>, backward: Partial<FabricObjectProps> }[]
  },
  [DrawSyncingEvent.fullErase]: undefined,
  [DrawSyncingEvent.MoveObjectUpOneLayer]: ShowAvatarActionParams & { objectIds: string[] },
  [DrawSyncingEvent.MoveObjectDownOneLayer]: ShowAvatarActionParams & { objectIds: string[] },
  [DrawSyncingEvent.MoveObjectToFront]: ShowAvatarActionParams & { objectIds: string[] },
  [DrawSyncingEvent.MoveObjectToBack]: ShowAvatarActionParams & { objectIds: string[] },
  [DrawSyncingEvent.FlipX]: ShowAvatarActionParams & { objectIds: string[] },
  [DrawSyncingEvent.FlipY]: ShowAvatarActionParams & { objectIds: string[] },
  [DrawSyncingEvent.ObjectsCopied]: ShowAvatarActionParams & { objectIds: string[], newObjectIds: string[] },
  [DrawSyncingEvent.BackgroundColorChanged]: { color: string },
  [DrawSyncingEvent.TextStyleChanged]: ShowAvatarActionParams & { style: any, objectId: string },
  [DrawSyncingEvent.ObjectStyleChanged]: ShowAvatarActionParams & { style: any, objectIds: string[] },
  [DrawSyncingEvent.ImgFilterChanged]: ShowAvatarActionParams & { filter: any, objectId: string },
  [DrawSyncingEvent.Undo]: HistoryAction,
  [DrawSyncingEvent.Redo]: HistoryAction,
  [DrawSyncingEvent.ObjectsMerged]: { mergedObjectIds: string[], groupId: string },
  [DrawSyncingEvent.ErasingEnd]: ShowAvatarActionParams & {
    objectIds: string[],
    erasePath: any,
    deletedObjectIds: string[]
  },
  [DrawSyncingEvent.TextChanged]: ShowAvatarActionParams & { objectId: string, newText: string },
}


export type DrawSyncingParams<T extends DrawSyncingEvent> = DrawSyncingMap[T]

export interface DrawSyncingAction<T extends DrawSyncingEvent = DrawSyncingEvent> {
  type: T
  params: DrawSyncingParams<T>
}