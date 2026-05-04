import { DrawTool, ToolService } from '@/draw/types/draw.types'
import { usePen } from '@/draw/store/tools/pen.store'
import { useEraser } from '@/draw/store/tools/eraser.store'
import { useSelect } from '@/draw/store/tools/select.store'
import { useBucket } from '@/draw/store/tools/bucket.store'
import { useLasso } from '@/draw/store/tools/lasso.tool'

export function createToolsMapping(): { [key in DrawTool]: ToolService } {
  return {
    [DrawTool.Pen]: usePen(),
    [DrawTool.MobileEraser]: useEraser(),
    [DrawTool.Select]: useSelect(),
    [DrawTool.Lasso]: useLasso(),
    [DrawTool.Bucket]: useBucket()
  }
}