import { FabricEvent, ToolService } from '@/draw/types/draw.types'
import { defineStore } from 'pinia'
import { isMobile } from '@/helper/general.helper'
import { bucketFill } from '@/draw/helpers/tools/bucket.helper'
import { Canvas, Point } from 'fabric'
import { disableObjectSelection, disableSelection } from '@/draw/helpers/select.helper'

export const useBucket = defineStore('bucket', (): ToolService => {
  let c: Canvas | undefined = undefined
  let gestureStart = false

  const events: FabricEvent[] = [
    {
      on: 'mouse:up',
      handler: async (o: any) => {
        if (gestureStart) {
          gestureStart = false
          return
        }
        if ((!isMobile() && o.e.button !== 0)) return // only execute button fill for left click
        const pointer: Point = c!.getViewportPoint(o.e)
        const img = await bucketFill(c!, pointer)
        if (!img) return
        disableObjectSelection(img)

        c!.add(img)
        c!.requestRenderAll()
      }
    },
    {
      on: 'gestureStart',
      handler: () => {
        gestureStart = true
      }
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
  }


  async function select() {
    if (!c) return
    c.isDrawingMode = false
    disableSelection()
  }

  return { select, init, events }
})