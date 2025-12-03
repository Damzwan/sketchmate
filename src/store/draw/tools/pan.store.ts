import { defineStore } from 'pinia'
import { type Canvas, Point } from 'fabric'
import { handlePan } from '@/helper/draw/drawInit.helper'
import { disableSelection } from '@/helper/draw/draw.helper'
import { FabricEvent, ToolService } from '@/types/draw.types'


export const usePan = defineStore('pan', (): ToolService => {
  let c: Canvas | undefined = undefined
  let panStartPoint: any = null

  const events: FabricEvent[] = [
    {
      on: 'mouse:down',
      handler: (o: any) => {
        const event = o.e
        if (event.button === 0) {
          panStartPoint = { x: event.pageX, y: event.pageY }
          event.preventDefault()
          event.stopPropagation()
        }
      }
    },
    {
      on: 'mouse:move',
      handler: (o: any) => {
        if (panStartPoint) {
          // If we are panning, calculate the delta and pan the canvas
          const event = o.e
          const deltaX = event.pageX - panStartPoint.x
          const deltaY = event.pageY - panStartPoint.y
          panStartPoint = { x: event.pageX, y: event.pageY }
          handlePan(new Point(deltaX, deltaY), c!)
          c!.requestRenderAll()
        }
      }
    },
    {
      on: 'mouse:up',
      handler: (o: any) => {
        // If we were panning, stop it
        if (panStartPoint) {
          panStartPoint = null
          o.e.preventDefault()
          o.e.stopPropagation()
        }
      }
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
  }

  async function select() {
    c!.isDrawingMode = false
    c!.selection = false
    disableSelection()
    c!.requestRenderAll()
  }

  return {
    select,
    init,
    events
  }
})
