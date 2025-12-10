import { HistoryAction, HistoryEvent, HistoryParams } from '@/draw/types/drawHistory.types'
import {
  redoFlipX,
  redoFlipY, redoMerge,
  redoObjectAdded,
  redoObjectModified, redoObjectsAdded,
  redoObjectsCopied,
  redoObjectsDeleted,
  redoObjectStyle, undoFlipX, undoFlipY, undoMerge, undoObjectAdded, undoObjectModified,
  undoObjectsAdded, undoObjectsCopied, undoObjectsDeleted, undoObjectStyle
} from '@/draw/helpers/history/object.helper'
import { redoErased, undoErased } from '@/draw/helpers/history/erase.helper'
import {
  redoMoveObjectsDownOneLayer,
  redoMoveObjectsToBack, redoMoveObjectsToFront,
  redoMoveObjectsUpOneLayer, undoMoveObjectsDownOneLayer, undoMoveObjectsToBack,
  undoMoveObjectsToFront, undoMoveObjectsUpOneLayer
} from '@/draw/helpers/history/layer.helper'
import { redoPolygonCreation, undoPolygonCreation } from '@/draw/helpers/history/shape.helper'
import { redoImgFilter, undoImgFilter } from '@/draw/helpers/history/image.helper'
import {
  redoChangeBackgroundColor,
  redoFullErase,
  undoChangeBackgroundColor, undoFullErase
} from '@/draw/helpers/history/canvas.helper'
import {
  redoTextChanged,
  redoTextStyleChanged,
  undoTextChanged,
  undoTextStyleChanged
} from '@/draw/helpers/history/text.helper'

export const undoActionMapping: {
  [K in HistoryEvent]: (params: HistoryAction<K>) => Promise<void> | void
} = {
  [HistoryEvent.ObjectAdded]: undoObjectAdded,
  [HistoryEvent.ObjectsAdded]: undoObjectsAdded, // TODO unify with ObjectAdded if needed
  [HistoryEvent.ObjectModified]: undoObjectModified,
  [HistoryEvent.Erasing]: undoErased,
  [HistoryEvent.FullErase]: undoFullErase,
  [HistoryEvent.MoveObjectToFront]: undoMoveObjectsToFront,
  [HistoryEvent.MoveObjectToBack]: undoMoveObjectsToBack,
  [HistoryEvent.MoveObjectDownOneLayer]: undoMoveObjectsDownOneLayer,
  [HistoryEvent.MoveObjectUpOneLayer]: undoMoveObjectsUpOneLayer,
  [HistoryEvent.FlipX]: undoFlipX,
  [HistoryEvent.FlipY]: undoFlipY,
  [HistoryEvent.ObjectsCopied]: undoObjectsCopied,
  [HistoryEvent.ObjectsDeleted]: undoObjectsDeleted,
  [HistoryEvent.BackgroundColorChanged]: undoChangeBackgroundColor,
  [HistoryEvent.TextChanged]: undoTextChanged,
  [HistoryEvent.TextStyleChanged]: undoTextStyleChanged,
  [HistoryEvent.PolygonCreation]: undoPolygonCreation,
  [HistoryEvent.ObjectStyleChanged]: undoObjectStyle,
  [HistoryEvent.ImgFilterChanged]: undoImgFilter,
  [HistoryEvent.Merge]: undoMerge
}


export const redoActionMapping: {
  [K in HistoryEvent]: (params: HistoryAction<K>) => Promise<void> | void
} = {
  [HistoryEvent.ObjectAdded]: redoObjectAdded,
  [HistoryEvent.ObjectsAdded]: redoObjectsAdded,
  [HistoryEvent.ObjectModified]: redoObjectModified,
  [HistoryEvent.Erasing]: redoErased,
  [HistoryEvent.FullErase]: redoFullErase,
  [HistoryEvent.MoveObjectToFront]: redoMoveObjectsToFront,
  [HistoryEvent.MoveObjectToBack]: redoMoveObjectsToBack,
  [HistoryEvent.MoveObjectDownOneLayer]: redoMoveObjectsDownOneLayer,
  [HistoryEvent.MoveObjectUpOneLayer]: redoMoveObjectsUpOneLayer,
  [HistoryEvent.FlipX]: redoFlipX,
  [HistoryEvent.FlipY]: redoFlipY,
  [HistoryEvent.ObjectsCopied]: redoObjectsCopied,
  [HistoryEvent.ObjectsDeleted]: redoObjectsDeleted,
  [HistoryEvent.BackgroundColorChanged]: redoChangeBackgroundColor,
  [HistoryEvent.TextChanged]: redoTextChanged,
  [HistoryEvent.TextStyleChanged]: redoTextStyleChanged,
  [HistoryEvent.PolygonCreation]: redoPolygonCreation,
  [HistoryEvent.ObjectStyleChanged]: redoObjectStyle,
  [HistoryEvent.ImgFilterChanged]: redoImgFilter,
  // if you have extra events like 'merge', add here with correct typing
  [HistoryEvent.Merge]: redoMerge
}
