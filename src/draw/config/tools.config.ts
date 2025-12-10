import { BrushType, DrawTool, Eraser, SelectTool } from '@/draw/types/draw.types'
import {
  mdiBrush,
  mdiCircleOutline,
  mdiCursorDefaultClickOutline,
  mdiEraser,
  mdiLasso,
  mdiPencilOutline,
  mdiSpray
} from '@mdi/js'
import { Canvas, CircleBrush, PencilBrush, SprayBrush } from 'fabric'
import { WaterColorBrush } from '@/draw/utils/brushes/WaterColorBrush'
import { BaseBrush } from 'fabric/fabric-impl'

export const ERASERS = [DrawTool.MobileEraser]
export const PENMENUTOOLS = [DrawTool.Pen, DrawTool.Bucket]
export const SELECTMENUTOOLS = [DrawTool.Select, DrawTool.Lasso]
export const eraserIconMapping: { [key in Eraser]: string } = {
  [DrawTool.MobileEraser]: mdiEraser
}
export const selectIconMapping: { [key in SelectTool]: string } = {
  [DrawTool.Select]: mdiCursorDefaultClickOutline,
  [DrawTool.Lasso]: mdiLasso
}
export const penBrushMapping: { [key in BrushType]: (c: Canvas) => BaseBrush } = {
  [BrushType.Circle]: (c: Canvas) => new CircleBrush(c),
  [BrushType.Pencil]: (c: Canvas) => new PencilBrush(c),
  [BrushType.Spray]: (c: Canvas) => new SprayBrush(c),
  [BrushType.WaterColor]: (c: Canvas) => new WaterColorBrush(c)
  // [BrushType.Ink]: (c: Canvas) => new InkBrush(c)
}
export const penIconMapping: { [key in BrushType]: string } = {
  [BrushType.Pencil]: mdiPencilOutline,
  [BrushType.WaterColor]: mdiBrush,
  [BrushType.Circle]: mdiCircleOutline,
  // [BrushType.Ink]: mdiLiquidSpot,
  [BrushType.Spray]: mdiSpray
}