import * as fabric from 'fabric'
import { Canvas } from 'fabric'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { useEraser } from '@/draw/store/tools/eraser.store'
import { DrawTool } from '@/draw/types/draw.types'
import { ERASERS } from '@/draw/config/tools.config'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useSelect } from '@/draw/store/tools/select.store'

function cancelEraserAction(c: Canvas) {
  const { cancelErase } = useEraser()
  cancelErase()
}

function cancelSelect(c: Canvas) {
  const { unSelect } = useSelect()
  unSelect()
}


function cancelPenAction(c: Canvas) {
  const brush = c.freeDrawingBrush
  if (!brush) return

  // Call internal reset safely if it exists on the brush prototype
  if (typeof (brush as any)._reset === 'function') {
    (brush as any)._reset()
  }

  if (c.contextTop) {
    c.clearContext(c.contextTop)
  }
}

export function cancelPreviousAction(c: Canvas) {
  const { selectedTool } = useToolSelection()
  if (ERASERS.includes(selectedTool)) cancelEraserAction(c)
  if (selectedTool == DrawTool.Pen) cancelPenAction(c)
  if (selectedTool == DrawTool.Select) cancelSelect(c)
}