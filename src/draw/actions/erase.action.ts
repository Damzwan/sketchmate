import { useDrawStore } from '@/draw/store/draw.store'
import { DrawTool } from '@/draw/types/draw.types'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { BACKGROUND } from '@/draw/config/canvas.config'

export function fullErase() {
  const { getCanvas, selectTool, selectedTool } = useDrawStore()
  const c = getCanvas()


  const prevCanvasJSON = c.toJSON()
  c.clear()
  c.backgroundColor = BACKGROUND
  c.requestRenderAll()
  c.fire('fullErase', { prevCanvasJSON })

  if (selectedTool !== DrawTool.Pen) {
    selectTool(DrawTool.Pen)
  }
}
