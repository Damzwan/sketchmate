import { Canvas } from 'fabric/fabric-impl'
import { useDrawStore } from '@/store/draw/draw.store'
import { useHistory } from '@/service/draw/history.service'
import { BACKGROUND } from '@/config/draw/draw.config'
import { DrawTool } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'
import { storeToRefs } from 'pinia'

export async function fullErase(c: Canvas, options: any = {}) {
  const { selectTool } = useDrawStore()
  const { addToUndoStack } = useHistory()
  const { actionWithoutEvents } = useEventManager()

  const noReset = options['noReset']

  await actionWithoutEvents(async () => {
    const json = c.toJSON()

    c.clear()

    // Wait for setBackgroundColor to complete
    await new Promise<void>(resolve =>
      c.setBackgroundColor(BACKGROUND, () => {
        const { backgroundColor } = storeToRefs(useDrawStore())
        backgroundColor.value = BACKGROUND

        addToUndoStack([json as any], 'fullErase', { noReset })
        resolve()
      })
    )

    selectTool(DrawTool.Pen)
  })
}
