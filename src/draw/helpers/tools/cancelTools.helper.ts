import * as fabric from 'fabric'
import { Canvas } from 'fabric'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { useEraser } from '@/draw/store/tools/eraser.store'
import { useDrawStore } from '@/draw/store/draw.store'
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

    // Call internal reset safely if it exists on the brush prototype
    if (typeof (brush as any)._reset === 'function') {
      (brush as any)._reset()
    }

    // 1. Snapshot the patient's canvas state BEFORE faking the mouse up
    const objectsBeforeCount = c.getObjects().length

    // 2. Trigger the brush's end sequence (this handles mixBlendMode and point resets)
    brush.onMouseUp(fakeEvent as any)

    // 3. Check if the brush actually committed new objects during the fake mouseUp
    const currentObjects = c.getObjects()
    if (currentObjects.length > objectsBeforeCount) {
      // Slice out any newly created "junk" strokes and remove them properly
      const objectsToRemove = currentObjects.slice(objectsBeforeCount)
      objectsToRemove.forEach(obj => c.remove(obj))
    }

    // 4. Scrub the top layer clean in case the custom brush left pigment mid-stroke
    if (c.contextTop) {
      c.clearContext(c.contextTop)
    }

    // 5. Temporarily disable movement tracking until the physical finger lifts
    const originalMove = brush.onMouseMove
    const originalUp = brush.onMouseUp
    brush.onMouseMove = () => {}
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
  if (selectedTool == DrawTool.Select) cancelSelect(c)
}