import { Ref, ref, watch } from 'vue'
import { DrawEvent, DrawTool, EraserSize, FabricEvent, ToolService } from '@/types/draw.types'
import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'
import { updateFreeDrawingCursor } from '@/helper/draw/draw.helper'
import { EventBus } from '@/main'
import { useDrawStore } from '@/store/draw/draw.store'

interface HealingEraser extends ToolService {
  healingEraserSize: Ref<number>
}

export const useHealingEraser = defineStore('healing eraser', (): HealingEraser => {
  let c: Canvas | undefined = undefined
  const healingEraserSize = ref<EraserSize>(EraserSize.small)
  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      type: DrawEvent.ShapeCreation,
      handler: updateEraserCursor
    }
  ]

  // TODO use eventManager instead
  EventBus.on('resetZoom', () => {
    const { selectedTool } = useDrawStore()
    if (selectedTool == DrawTool.HealingEraser) updateEraserCursor()
  })

  function init(canvas: Canvas) {
    c = canvas
  }

  function destroy() {
    c = undefined
  }

  function updateEraserCursor() {
    updateFreeDrawingCursor(c!, healingEraserSize.value, c!.backgroundColor as string, true)
  }

  async function select(canvas: Canvas) {
    canvas.isDrawingMode = true
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    canvas.freeDrawingBrush = new fabric.EraserBrush(c)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    canvas.freeDrawingBrush.inverted = true
    canvas.freeDrawingBrush.width = healingEraserSize.value
    updateEraserCursor()
  }

  watch(healingEraserSize, () => {
    c!.freeDrawingBrush.width = healingEraserSize.value
    updateEraserCursor()
  })

  return { init, select, healingEraserSize, events, destroy }
})
