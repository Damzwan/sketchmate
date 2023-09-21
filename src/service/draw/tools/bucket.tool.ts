import { DrawEvent, FabricEvent, ToolService } from '@/types/draw.types'
import { setObjectSelection, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { Canvas, IPoint } from 'fabric/fabric-impl'
import { defineStore } from 'pinia'
import { bucketFill } from '@/helper/draw/actions/bucket.action'
import { EventBus } from '@/main'
import { isMobile } from '@/helper/general.helper'

export const useBucket = defineStore('bucket', (): ToolService => {
  let c: Canvas | undefined = undefined

  let timeout: any

  const events: FabricEvent[] = [
    {
      type: DrawEvent.BucketFill,
      on: 'mouse:down:before',
      handler: async (o: any) => {
        if (timeout) return
        timeout = setTimeout(
          async () => {
            timeout = undefined
            const pointer: IPoint = c!.getPointer(o.e)
            const img = await bucketFill(c!, pointer)
            if (!img) return
            c!.add(img)
            setObjectSelection(img, false) // TODO should not be necessary
            c!.renderAll()
          },
          isMobile() ? 100 : 0
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
