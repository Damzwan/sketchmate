import { DrawAction } from '@/draw/types/draw.types'
import { fullErase } from '@/draw/actions/erase.action'
import {
  addSavedFabricObjectToCanvas,
  copyObjects,
  flipXObjects,
  flipYObjects, mergeObjects,
  moveObjectDownOneLayer,
  moveObjectToBack,
  moveObjectToFront,
  moveObjectUpOneLayer,
  removeSelectedObjects,
  saveFabricObject,
  setPropertiesOfObjects,
  unselectObjects
} from '@/draw/actions/object.action'
import { addFilterToImg, addImageToCanvas } from '@/draw/actions/image.action'
import {
  changeStrokeWidth, exitColorPickerMode,
  setBackgroundColor,
  setCanvasBackground,
  setFillColor,
  setStrokeColor
} from '@/draw/actions/color.action'
import {
  addText,
  changeFont,
  changeFontStyle,
  changeFontWeight,
  changeTextAlign, exitTextAddingMode
} from '@/draw/actions/text.action'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import { addShape, confirmShapeCreation } from '@/draw/actions/shape.action'

export const drawActionMapping: Record<DrawAction, (params?: any) => Promise<void> | void> = {
  [DrawAction.FullErase]: fullErase,
  [DrawAction.SetPropertiesOfObject]: setPropertiesOfObjects,
  [DrawAction.MoveObjectToFront]: moveObjectToFront,
  [DrawAction.MoveObjectToBack]: moveObjectToBack,
  [DrawAction.MoveObjectUpOneLayer]: moveObjectUpOneLayer,
  [DrawAction.MoveObjectDownOneLayer]: moveObjectDownOneLayer,
  [DrawAction.FlipX]: flipXObjects,
  [DrawAction.FlipY]: flipYObjects,
  [DrawAction.CopyObject]: copyObjects,
  [DrawAction.AddImage]: addImageToCanvas,
  [DrawAction.RemoveSelectedObjects]: removeSelectedObjects,
  [DrawAction.AddSavedDrawingToCanvas]: addSavedFabricObjectToCanvas,
  [DrawAction.UnselectObjects]: unselectObjects,
  [DrawAction.SetCanvasBackground]: setCanvasBackground,
  [DrawAction.SaveFabricObject]: saveFabricObject,
  [DrawAction.AddText]: addText,
  [DrawAction.Undo]: () => {
    const drawHistoryManager = useDrawHistoryManager()
    drawHistoryManager.undo()
  },
  [DrawAction.Redo]: () => {
    const drawHistoryManager = useDrawHistoryManager()
    drawHistoryManager.redo()
  },
  [DrawAction.ChangeFont]: changeFont,
  [DrawAction.ChangeFontWeight]: changeFontWeight,
  [DrawAction.ChangeTextAlign]: changeTextAlign,
  [DrawAction.ChangeFontStyle]: changeFontStyle,
  [DrawAction.AddShape]: addShape,
  [DrawAction.ConfirmShapeCreation]: confirmShapeCreation,
  [DrawAction.SetObjectStrokeColor]: setStrokeColor,
  [DrawAction.SetObjectFillColor]: setFillColor,
  [DrawAction.SetObjectBackgroundColor]: setBackgroundColor,
  [DrawAction.ChangeStrokeWidth]: changeStrokeWidth,
  [DrawAction.Merge]: mergeObjects,
  [DrawAction.ExitColorPickerMode]: exitColorPickerMode,
  [DrawAction.ExitTextAddingMode]: exitTextAddingMode,
  [DrawAction.AddImgFilter]: addFilterToImg
}