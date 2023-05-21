import { BrushType, DrawAction, DrawTool, Eraser } from '@/types/draw.types'
import { fabric } from 'fabric'
import { Canvas } from 'fabric/fabric-impl'
import { mdiBandage, mdiBucketOutline, mdiCircleOutline, mdiEraser, mdiPencilOutline, mdiSpray } from '@mdi/js'
import {
  addSticker,
  copyObjects,
  fullErase,
  selectBucket,
  selectHealingMobileEraser,
  selectMobileEraser,
  selectMove,
  selectPen,
  selectSelect,
  setBgImage
} from '@/helper/draw.helper'

export const COLORSWATCHES = [
  ['#000000', '#F3F1F9', '#FF0000', '#00FF00', '#0000FF', '#FFFF00'],
  ['#FFA500', '#FF00FF', '#00FFFF', '#800080', '#808080', '#C0C0C0'],
  ['#964B00', '#FF69B4', '#008000', '#4B0082', '#FF4500', '#2E8B57']
]

export const BRUSHSIZE = 10
export const BLACK = '#000000'
export const WHITE = '#FFFFFF'
export const TEXTSIZE = 25
export const TEXTCOLOR = '#000000'

export const ERASERS = [DrawTool.MobileEraser, DrawTool.HealingEraser]
export const PENS = [DrawTool.Pen]

export const brushMapping: { [key in BrushType]: any } = {
  [BrushType.Circle]: (c: Canvas) => new fabric.CircleBrush(c),
  [BrushType.Pencil]: (c: Canvas) => new fabric.PencilBrush(c),
  [BrushType.Spray]: (c: Canvas) => new fabric.SprayBrush(c),
  [BrushType.Bucket]: (c: Canvas) => null
}

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

export const selectToolMapping: { [key in DrawTool]: (c: Canvas) => void } = {
  [DrawTool.Pen]: selectPen,
  [DrawTool.MobileEraser]: selectMobileEraser,
  [DrawTool.HealingEraser]: selectHealingMobileEraser,
  [DrawTool.Move]: selectMove,
  [DrawTool.Select]: selectSelect
}

export const actionMapping: { [key in DrawAction]: (c: Canvas, options?: object) => void } = {
  [DrawAction.FullErase]: fullErase,
  [DrawAction.Sticker]: addSticker,
  [DrawAction.CopyObject]: copyObjects,
  [DrawAction.BackgroundImage]: setBgImage,
  [DrawAction.Bucket]: selectBucket
}
