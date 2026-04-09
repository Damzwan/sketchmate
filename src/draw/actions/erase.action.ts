import { useDrawStore } from '@/draw/store/draw.store'
import { DrawTool } from '@/draw/types/draw.types'
import { BACKGROUND } from '@/draw/config/canvas.config'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useAuthStore } from '@/store/auth.store'
import { removeObjects } from '@/draw/actions/object.action'

export function fullErase() {
  const { getCanvas } = useDrawStore()
  const { roomId } = useDrawSyncer()
  if (roomId) {
    const { user } = useAuthStore()
    if (!user) return
    const objectsToDelete = getCanvas().getObjects().filter(obj => obj.userId === user._id)
    removeObjects(objectsToDelete)
  } else {
    const { selectTool, selectedTool } = useToolSelection()
    const c = getCanvas()
    if (!c) return


    const prevCanvasJSON = c.toJSON()
    c.clear()
    c.backgroundColor = BACKGROUND
    c.requestRenderAll()
    c.fire('fullErase', { prevCanvasJSON })

    if (selectedTool !== DrawTool.Pen) {
      selectTool(DrawTool.Pen)
    }
  }
}
