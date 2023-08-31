import { Ref, ref, watch } from 'vue'
import { DrawEvent, DrawTool, EraserSize, FabricEvent, ToolService } from '@/types/draw.types'
import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'
import { updateFreeDrawingCursor } from '@/helper/draw/draw.helper'
import { EventBus } from '@/main'
import { useDrawStore } from '@/store/draw/draw.store'

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
