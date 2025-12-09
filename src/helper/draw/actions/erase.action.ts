import { useDrawStore } from '@/store/draw/draw.store'
import { BACKGROUND } from '@/config/draw/draw.config'
import { DrawTool } from '@/types/draw.types'
import { useDrawObjectManager } from '@/store/draw/DrawObjectManager.store'

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
