import { BrushType, DrawTool, type Eraser, type SelectTool } from "@/draw/tools/tool.types";
import {
  mdiBrushOutline,
  mdiBrushVariant,
  mdiCircleOutline,
  mdiCursorDefaultClickOutline,
  mdiDotsGrid,
  mdiEraser,
  mdiFlare,
  mdiGrillOutline,
  mdiLasso,
  mdiLeadPencil,
  mdiPencilOutline,
  mdiSpray
} from '@mdi/js'
import { Canvas } from 'fabric'
import { WaterColorBrush } from '@/draw/utils/brushes/WaterColorBrush'
import { BaseBrush } from 'fabric/fabric-impl'
import { CrayonBrush } from '@/draw/utils/brushes/CrayonBrush'
import { CharcoalBrush } from '@/draw/utils/brushes/CharcoalBrush'
import { PixelBrush } from '@/draw/utils/brushes/PixelBrush'
import { FastSprayBrush } from '@/draw/utils/brushes/CustomSprayBrush'
import { NeonBrush } from '@/draw/utils/brushes/NeonSignBrush'
import { CalligraphyBrush } from '@/draw/utils/brushes/CalligraphyBrush'
import { CustomCircleBrush } from '@/draw/utils/brushes/CustomCircleBrush'
import { OptimizedPencilBrush } from '@/draw/utils/brushes/CustomPencilBrush'

export const ERASERS = [DrawTool.MobileEraser]
export const PENMENUTOOLS = [DrawTool.Pen]
export const SELECTMENUTOOLS = [DrawTool.Select, DrawTool.Lasso]
export const eraserIconMapping: { [key in Eraser]: string } = {
  [DrawTool.MobileEraser]: mdiEraser
}
export const selectIconMapping: { [key in SelectTool]: string } = {
  [DrawTool.Select]: mdiCursorDefaultClickOutline,
  [DrawTool.Lasso]: mdiLasso
}
export const penBrushMapping: { [key in BrushType]: (c: Canvas) => BaseBrush } = {
  [BrushType.Pencil]: (c: Canvas) => new OptimizedPencilBrush(c),
  [BrushType.Spray]: (c: Canvas) => new FastSprayBrush(c),
  [BrushType.Circle]: (c: Canvas) => new CustomCircleBrush(c),
  [BrushType.WaterColor]: (c: Canvas) => new WaterColorBrush(c),
  [BrushType.Charcoal]: (c: Canvas) => new CharcoalBrush(c),
  [BrushType.Crayon]: (c: Canvas) => new CrayonBrush(c),
  [BrushType.Pixel]: (c: Canvas) => new PixelBrush(c),
  [BrushType.Neon]: (c: Canvas) => new NeonBrush(c),
  [BrushType.CalliGraphy]: (c: Canvas) => new CalligraphyBrush(c)
}
export const penIconMapping: { [key in BrushType]: string } = {
  [BrushType.Pencil]: mdiPencilOutline,
  [BrushType.WaterColor]: mdiBrushVariant,
  [BrushType.Circle]: mdiCircleOutline,
  [BrushType.Spray]: mdiSpray,
  [BrushType.Charcoal]: mdiGrillOutline,
  [BrushType.Crayon]: mdiLeadPencil,
  [BrushType.Pixel]: mdiDotsGrid,
  [BrushType.Neon]: mdiFlare,
  [BrushType.CalliGraphy]: mdiBrushOutline
}
