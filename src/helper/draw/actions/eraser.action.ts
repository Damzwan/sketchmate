import { Canvas } from 'fabric/fabric-impl'
import { useDrawStore } from '@/store/draw/draw.store'
import { useHistory } from '@/service/draw/history.service'
import { BACKGROUND } from '@/config/draw/draw.config'
import { DrawTool } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'

export function fullErase(c: Canvas) {
  const { selectTool } = useDrawStore()
  const { addToUndoStack } = useHistory()
  const { actionWithoutEvents } = useEventManager()

  actionWithoutEvents(() => {
    addToUndoStack([c.toJSON() as any], 'fullErase')
    c.clear()
    c.setBackgroundColor(BACKGROUND, () => {
      console.log('Background cleared')
    })
    selectTool(DrawTool.Pen)
  })
}
