import { DrawEvent, FabricEvent, ToolService } from '@/types/draw.types'
import { setObjectSelection, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { Canvas, IPoint } from 'fabric/fabric-impl'
import { defineStore } from 'pinia'
import { bucketFill } from '@/helper/draw/actions/bucket.action'
import { EventBus } from '@/main'
import { isMobile } from '@/helper/general.helper'
import { useHistory } from '@/service/draw/history.service'
import { useDrawStore } from '@/store/draw/draw.store'

export const useBucket = defineStore('bucket', (): ToolService => {
  let c: Canvas | undefined = undefined

  let timeout: any

  const events: FabricEvent[] = [
    {
      type: DrawEvent.BucketFill,
      on: 'mouse:down',
      handler: async (o: any) => {
        // we use mouse:down to disable all click events in case we add text
        const { colorPickerMode } = useDrawStore()
        if (o.e.button !== 0 || colorPickerMode) return // only execute button fill for left click and now in colorpicker mode
        if (timeout) return
        timeout = setTimeout(
          async () => {
            timeout = undefined

            const pointer: IPoint = c!.getPointer(o.e)
            const img = await bucketFill(c!, pointer)
            if (!img) return


            img.bucketFillObject = true
            const highestZIndex = c!.getObjects().reduce((accumulator, currentValue, currentIndex) => currentValue.bucketFillObject && img.intersectsWithObject(currentValue) ? Math.max(currentIndex, accumulator) : accumulator, -1)
            c!.add(img)

            c!.moveTo(img, highestZIndex + 1)
            setObjectSelection(img, false) // TODO should not be necessary
            setTimeout(() => {
              const { enabled, addToUndoStack } = useHistory()
              if (!enabled) addToUndoStack([img], 'object:added') // TODO this is a quick fix, fundamental changes need to be made
            }, 50)
            c!.requestRenderAll()
          },
          isMobile() ? 200 : 0
        )
      }
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
    EventBus.on('gesture', () => {
      if (timeout) {
        clearTimeout(timeout)
        timeout = undefined
      }
    })
  }

  function destroy() {
    c = undefined
  }

  async function select(c: Canvas) {
    c.isDrawingMode = false
    c.selection = false
    setSelectionForObjects(c.getObjects(), false) // TODO this should not be necessary
  }

  return { select, init, events: events, destroy }
})
