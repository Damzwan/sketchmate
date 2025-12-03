import { DrawAction } from '@/types/draw.types'
import { fullErase } from '@/helper/draw/actions/erase.action'
import {
  addObject,
  addSavedFabricObjectToCanvas,
  copyObjects,
  flipXObjects,
  flipYObjects, mergeObjects,
  moveObjectDownOneLayer,
  moveObjectToBack,
  moveObjectToFront,
  moveObjectUpOneLayer,
  removeObjectByID,
  removeSelectedObjects,
  saveFabricObject,
  setPropertiesOfObjects,
  transformObjectById,
  unselectObjects
} from '@/helper/draw/actions/object.action'
import { addFilterToImg, addImageToCanvas } from '@/helper/draw/actions/image.action'
import {
  changeStrokeWidth, exitColorPickerMode,
  setBackgroundColor,
  setCanvasBackground,
  setFillColor,
  setStrokeColor
} from '@/helper/draw/actions/color.action'
import {
  addText,
  changeFont,
  changeFontStyle,
  changeFontWeight,
  changeTextAlign, exitTextAddingMode
} from '@/helper/draw/actions/text.action'
import { useDrawHistoryManager } from '@/store/draw/drawHistoryManager.store'
import { addShape, confirmShapeCreation } from '@/helper/draw/actions/shape.action'

export const drawActionMapping: Record<DrawAction, (params?: any) => Promise<void> | void> = {
  [DrawAction.FullErase]: fullErase,
  [DrawAction.AddObject]: addObject,
  [DrawAction.RemoveObjectsByID]: removeObjectByID,
  [DrawAction.TransformObject]: transformObjectById,
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
  [DrawAction.saveFabricObject]: saveFabricObject,
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
  [DrawAction.SetStrokeColor]: setStrokeColor,
  [DrawAction.SetFillColor]: setFillColor,
  [DrawAction.SetBackgroundColor]: setBackgroundColor,
  [DrawAction.ChangeStrokeWidth]: changeStrokeWidth,
  [DrawAction.Merge]: mergeObjects,
  [DrawAction.ExitColorPickerMode]: exitColorPickerMode,
  [DrawAction.ExitTextAddingMode]: exitTextAddingMode,
  [DrawAction.AddImgFilter]: addFilterToImg,

}