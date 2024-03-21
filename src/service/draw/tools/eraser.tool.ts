import { Ref, ref, watch } from 'vue'
import { DrawEvent, DrawTool, EraserSize, FabricEvent, ToolService } from '@/types/draw.types'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'
import { updateFreeDrawingCursor } from '@/helper/draw/draw.helper'
import { EventBus } from '@/main'
import { useDrawStore } from '@/store/draw/draw.store'
import { Canvas } from 'fabric/fabric-impl'
import { isMobile } from '@/helper/general.helper'

interface Eraser extends ToolService {
  eraserSize: Ref<number>
}

export const useEraser = defineStore('eraser', (): Eraser => {
  let c: Canvas | undefined = undefined

  const eraserSize = ref<EraserSize>(EraserSize.small)

  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      type: DrawEvent.ShapeCreation,
      handler: updateEraserCursor
    },
    {
      on: 'mouse:move',
      type: DrawEvent.Gesture,
      handler: (e) => {
        if (!isMobile()) return
        const pointer = e.pointer
        const ctx = c!.contextTop

        ctx.beginPath()

        ctx.arc(pointer.x, pointer.y, (eraserSize.value * c!.getZoom()) / 2, 0, 2 * Math.PI)
        ctx.strokeStyle = 'lightblue' // Adjust stroke color as needed
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  ]

  EventBus.on('resetZoom', () => {
    const { selectedTool } = useDrawStore()
    if (selectedTool == DrawTool.MobileEraser) updateEraserCursor()
  })

  function init(canvas: Canvas) {
    c = canvas
  }

  function destroy() {
    c = undefined
  }

  function updateEraserCursor() {
    updateFreeDrawingCursor(c!, eraserSize.value, c!.backgroundColor as string, true)
  }

  async function select(c: Canvas) {
    c.isDrawingMode = true
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const b = new fabric.EraserBrush(c)

    c.freeDrawingBrush = b
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    c.freeDrawingBrush.inverted = false
    c.freeDrawingBrush.width = eraserSize.value
    updateEraserCursor()
  }

  watch(eraserSize, () => {
    c!.freeDrawingBrush.width = eraserSize.value
    updateEraserCursor()
  })

  return { init, select, eraserSize, events, destroy }
})
