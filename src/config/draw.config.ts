import { BrushType, DrawAction, DrawTool, Eraser } from '@/types/draw.types'
import { Canvas } from 'fabric/fabric-impl'
import {
  mdiBandage,
  mdiBucketOutline,
  mdiCircleOutline,
  mdiEraser,
  mdiLiquidSpot,
  mdiPencilOutline,
  mdiSpray
} from '@mdi/js'
import { fullErase } from '@/helper/draw/actions/eraser.action'
import { copyObjects, deleteObjects, mergeObjects } from '@/helper/draw/actions/operation.action'
import { addSavedToCanvas, createSaved } from '@/helper/draw/actions/saved.action'
import { addSticker, setBackgroundImage } from '@/helper/draw/actions/image.action'
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

export const COLORSWATCHES = [
  // Grayscale
  [
    '#000000',
    '#808080',
    '#C0C0C0',
    '#FFFFFF',
    // Reds
    '#FF0000',
    '#FF6347'
  ],

  // More Reds, Pinks
  [
    '#FF4500',
    '#FFC0CB',
    '#FF69B4',
    '#FF1493',
    // Oranges
    '#FFA500',
    '#FF8C00'
  ],

  // More Oranges, Yellows
  [
    '#FF7F50',
    '#FFFF00',
    '#FFD700',
    '#FFDAB9',
    // Greens
    '#008000',
    '#00FF00'
  ],

  // More Greens, Blues
  ['#32CD32', '#ADFF2F', '#0000FF', '#00BFFF', '#1E90FF', '#ADD8E6'],

  // Indigos, Violets
  ['#4B0082', '#483D8B', '#6A5ACD', '#7B68EE', '#EE82EE', '#DA70D6']
]

export const BRUSHSIZE = 10
export const BLACK = '#000000'
export const WHITE = '#FFFFFF'
export const BACKGROUND = '#FAF0E6'

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
  [BrushType.Bucket]: mdiBucketOutline,
  [BrushType.Ink]: mdiLiquidSpot
}

export const actionMapping: { [key in DrawAction]: (c: Canvas, options?: object) => void } = {
  [DrawAction.FullErase]: fullErase,
  [DrawAction.Sticker]: addSticker,
  [DrawAction.CopyObject]: copyObjects,
  [DrawAction.BackgroundImage]: setBackgroundImage,
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
