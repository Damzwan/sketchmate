import { Canvas } from 'fabric/fabric-impl'
import { useDrawStore } from '@/store/draw/draw.store'
import { useHistory } from '@/service/draw/history.service'
import { WHITE } from '@/config/draw.config'
import { DrawTool } from '@/types/draw.types'

export function fullErase(c: Canvas) {
  const { selectTool } = useDrawStore()
  const { customSaveAction } = useHistory()

  customSaveAction(() => {
    c.clear()
    c.setBackgroundColor(WHITE, () => {
      console.log('Background cleared')
    })
    selectTool(DrawTool.Pen)
  })
}
