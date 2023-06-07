import { BrushType, DrawAction, DrawTool, Eraser, RestoreAction } from '@/types/draw.types'
import { fabric } from 'fabric'
import { Canvas, IText } from 'fabric/fabric-impl'
import { mdiBandage, mdiBucketOutline, mdiCircleOutline, mdiEraser, mdiPencilOutline, mdiSpray } from '@mdi/js'
import { fullErase } from '@/helper/draw/actions/eraser.action'
import { copyObjects, deleteObjects, mergeObjects } from '@/helper/draw/actions/operation.action'
import { addSavedToCanvas, createSaved } from '@/helper/draw/actions/saved.action'
import { addSticker, setBgImage } from '@/helper/draw/actions/image.action'
import { addShape } from '@/helper/draw/actions/shape.action'
import {
  addText,
  changeFont,
  changeFontStyle,
  changeFontWeight,
  changeTextAlign,
  curveText
} from '@/helper/draw/actions/text.action'
import { setBackgroundColor, setFillColor, setStrokeColor } from '@/helper/draw/actions/color.action'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'

export const COLORSWATCHES = [
  ['#000000', '#F3F1F9', '#FF0000', '#00FF00', '#0000FF', '#FFFF00'],
  ['#FFA500', '#FF00FF', '#00FFFF', '#800080', '#808080', '#C0C0C0']
]

export const BRUSHSIZE = 10
export const BLACK = '#000000'
export const WHITE = '#FFFFFF'
export const TEXTSIZE = 25
export const TEXTCOLOR = '#000000'

export const ERASERS = [DrawTool.MobileEraser, DrawTool.HealingEraser]
export const PENS = [DrawTool.Pen]

export const FONTS: string[] = [
  'Arial',
  'Anton',
  'Indie Flower',
  'Rubik Puddles',
  'Chokokutai',
  'Dancing Script',
  'Amatic SC',
  'Krub'
]
export const eraserIconMapping: { [key in Eraser]: string } = {
  [DrawTool.MobileEraser]: mdiEraser,
  [DrawTool.HealingEraser]: mdiBandage
}

export const penIconMapping: { [key in BrushType]: string } = {
  [BrushType.Pencil]: mdiPencilOutline,
  [BrushType.Spray]: mdiSpray,
  [BrushType.Circle]: mdiCircleOutline,
  [BrushType.Bucket]: mdiBucketOutline
}

export const actionMapping: { [key in DrawAction]: (c: Canvas, options?: object) => void } = {
  [DrawAction.FullErase]: fullErase,
  [DrawAction.Sticker]: addSticker,
  [DrawAction.CopyObject]: copyObjects,
  [DrawAction.BackgroundImage]: setBgImage,
  [DrawAction.AddShape]: addShape,
  [DrawAction.AddText]: addText,
  [DrawAction.Merge]: mergeObjects,
  [DrawAction.CreateSaved]: createSaved,
  [DrawAction.AddSavedToCanvas]: addSavedToCanvas,
  [DrawAction.Delete]: deleteObjects,
  [DrawAction.ChangeStrokeColour]: setStrokeColor,
  [DrawAction.ChangeFillColour]: setFillColor,
  [DrawAction.ChangeBackgroundColor]: setBackgroundColor,
  [DrawAction.ChangeFont]: changeFont,
  [DrawAction.ChangeFontWeight]: changeFontWeight,
  [DrawAction.ChangeFontStyle]: changeFontStyle,
  [DrawAction.ChangeTextAlign]: changeTextAlign,
  [DrawAction.CurveText]: curveText
}
