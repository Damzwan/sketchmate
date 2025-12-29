export enum DrawSyncingEvent {
  added = 'added',
  removed = 'removed',
  modified = 'modified',
}

export type DrawSyncingMap = {
  [DrawSyncingEvent.added]: { objectJSONS: any[] }
  [DrawSyncingEvent.removed]: { objectIds: string[] }
  [DrawSyncingEvent.modified]: { objectIds: string[], transform: any }
}


export type DrawSyncingParams<T extends DrawSyncingEvent> = DrawSyncingMap[T]

export interface DrawSyncingAction<T extends DrawSyncingEvent = DrawSyncingEvent> {
  type: T
  params: DrawSyncingParams<T>
}