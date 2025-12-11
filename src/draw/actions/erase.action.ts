import { useDrawStore } from '@/draw/store/draw.store'
import { DrawTool } from '@/draw/types/draw.types'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { BACKGROUND } from '@/draw/config/canvas.config'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'

export function fullErase() {
  const { getCanvas } = useDrawStore()
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
