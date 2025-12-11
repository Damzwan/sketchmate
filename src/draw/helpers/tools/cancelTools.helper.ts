import * as fabric from 'fabric'
import { Canvas } from 'fabric'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { useEraser } from '@/draw/store/tools/eraser.store'
import { useDrawStore } from '@/draw/store/draw.store'
import { DrawTool } from '@/draw/types/draw.types'
import { ERASERS } from '@/draw/config/tools.config'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'

function cancelEraserAction(c: Canvas) {
  const { cancelErase } = useEraser()
  cancelErase()
}

// TODO quite hacky
function cancelPenAction(c: Canvas) {
  const { actionWithoutEvents } = useDrawEventManager()

  actionWithoutEvents(() => {
    const brush = c.freeDrawingBrush
    if (!brush) return

    const fakeEvent = {
      pointer: new fabric.Point(0, 0),
      e: { isPrimary: true }
    }
    brush._reset()
    brush.onMouseUp(fakeEvent as any)

    const lastObject = c.getObjects().pop()
    if (lastObject) c.remove(lastObject)

    const originalMove = brush.onMouseMove
    const originalUp = brush.onMouseUp
    brush.onMouseMove = () => {
    }
    brush.onMouseUp = () => {
      brush.onMouseUp = originalUp
      brush.onMouseMove = originalMove
    }

  })

}

export function cancelPreviousAction(c: Canvas) {
  const { selectedTool } = useToolSelection()
  if (ERASERS.includes(selectedTool)) cancelEraserAction(c) // needs to happen before touch up
  if (selectedTool == DrawTool.Pen) cancelPenAction(c) // needs to happen after touch up
}