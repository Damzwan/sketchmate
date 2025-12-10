import { DrawTool, ToolService } from '@/draw/types/draw.types'
import { usePen } from '@/draw/store/tools/pen.store'
import { useEraser } from '@/draw/store/tools/eraser.store'
import { useSelect } from '@/draw/store/tools/select.store'
import { usePan } from '@/draw/store/tools/pan.store'
import { useBucket } from '@/draw/store/tools/bucket.store'

export function createToolsMapping(): { [key in DrawTool]: ToolService } {
  return {
    [DrawTool.Pen]: usePen(),
    [DrawTool.MobileEraser]: useEraser(),
    [DrawTool.Select]: useSelect(),
    [DrawTool.Lasso]: useSelect(), // TODO fix
    [DrawTool.Pan]: usePan(),
    [DrawTool.Bucket]: useBucket()
  }
}