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
import {
  bringToBack,
  bringToFront,
  copyObjects,
  deleteObjects,
  mergeObjects
} from '@/helper/draw/actions/operation.action'
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
import { DynamicTextPart } from '@/types/loader.types'

export const COLORSWATCHES = [
  // Grayscale, Reds, Oranges
  [
    '#000000', // Black
    '#808080', // Gray
    '#C0C0C0', // Silver
    '#FFFFFF', // White
    '#FF0000', // Red
    '#FF4500' // OrangeRed
  ],

  // Yellows, Greens
  [
    '#FFA500', // Orange
    '#FF8C00', // DarkOrange
    '#FFFF00', // Yellow
    '#008000', // Green
    '#006400', // DarkGreen
    '#808000' // Olive
  ],

  // Turquoise, Blues
  [
    '#40E0D0', // Turquoise
    '#00FFFF', // Cyan
    '#00BFFF', // DeepSkyBlue
    '#0000FF', // Blue
    '#8A2BE2', // BlueViolet
    '#800080' // Purple
  ],

  // Pinks, Browns
  [
    '#FFC0CB', // Pink
    '#FF1493', // DeepPink
    '#A52A2A', // Brown
    '#8B4513', // SaddleBrown
    '#800000', // Maroon
    '#835C3B'
  ]
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
  [DrawAction.CurveText]: curveText,
  [DrawAction.BringToFront]: bringToFront,
  [DrawAction.BringToBack]: bringToBack
}

export const dynamicStickerLoading: DynamicTextPart[] = [
  { text: 'Uploading...', duration: 1000 },
  { text: 'Creating Sticker...', duration: 2000 }
]
