import { HistoryAction, HistoryEvent } from '@/store/draw/drawHistoryManager.store'
import {
  undoChangeBackgroundColor,
  undoErased,
  undoFlipX,
  undoFlipY,
  undoFullErase, undoImgFilter, undoMerge,
  undoMoveObjectsDownOneLayer,
  undoMoveObjectsToBack,
  undoMoveObjectsToFront,
  undoMoveObjectsUpOneLayer,
  undoObjectAdded,
  undoObjectModified,
  undoObjectsCopied,
  undoObjectsDeleted, undoObjectStyle,
  undoPolygonCreation,
  undoTextChanged,
  undoTextStyleChanged
} from '@/helper/draw/undo.helper'
import {
  redoChangeBackgroundColor,
  redoErased,
  redoFlipX,
  redoFlipY,
  redoFullErase, redoImgFilter, redoMerge,
  redoMoveObjectsDownOneLayer,
  redoMoveObjectsToBack,
  redoMoveObjectsToFront,
  redoMoveObjectsUpOneLayer,
  redoObjectAdded,
  redoObjectModified,
  redoObjectsCopied,
  redoObjectsDeleted, redoObjectStyle,
  redoPolygonCreation,
  redoTextChanged,
  redoTextStyleChanged
} from '@/helper/draw/redo.helper'

export const undoActionMapping: Record<
  HistoryEvent,
  (params: HistoryAction) => Promise<void> | void
> = {
  'object:added': undoObjectAdded,
  'objects:added': undoObjectAdded, // TODO they should be unified
  'object:modified': undoObjectModified,
  erasing: undoErased,
  fullErase: undoFullErase,
  moveObjectToFront: undoMoveObjectsToFront,
  moveObjectToBack: undoMoveObjectsToBack,
  moveObjectDownOneLayer: undoMoveObjectsDownOneLayer,
  moveObjectUpOneLayer: undoMoveObjectsUpOneLayer,
  flipX: undoFlipX,
  flipY: undoFlipY,
  objectsCopied: undoObjectsCopied,
  objectsDeleted: undoObjectsDeleted,
  backgroundColorChanged: undoChangeBackgroundColor,
  textChanged: undoTextChanged,
  textStyleChanged: undoTextStyleChanged,
  polygonCreation: undoPolygonCreation,
  objectStyleChanged: undoObjectStyle,
  imgFilterChanged: undoImgFilter,
  merge: undoMerge,
}
export const redoActionMapping: Record<
  HistoryEvent,
  (params: HistoryAction) => Promise<void> | void
> = {
  'object:added': redoObjectAdded,
  'objects:added': redoObjectAdded,
  'object:modified': redoObjectModified,
  erasing: redoErased,
  fullErase: redoFullErase,
  moveObjectToFront: redoMoveObjectsToFront,
  moveObjectToBack: redoMoveObjectsToBack,
  moveObjectDownOneLayer: redoMoveObjectsDownOneLayer,
  moveObjectUpOneLayer: redoMoveObjectsUpOneLayer,
  flipX: redoFlipX,
  flipY: redoFlipY,
  objectsCopied: redoObjectsCopied,
  objectsDeleted: redoObjectsDeleted,
  backgroundColorChanged: redoChangeBackgroundColor,
  textChanged: redoTextChanged,
  textStyleChanged: redoTextStyleChanged,
  polygonCreation: redoPolygonCreation,
  objectStyleChanged: redoObjectStyle,
  imgFilterChanged: redoImgFilter,
  merge: redoMerge,
}