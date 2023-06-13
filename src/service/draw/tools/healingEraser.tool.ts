import { Ref, ref, watch } from 'vue'
import { EraserSize, FabricEvent, ToolService } from '@/types/draw.types'
import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'

interface HealingEraser extends ToolService {
  healingEraserSize: Ref<number>
}

export const useHealingEraser = defineStore('healing eraser', (): HealingEraser => {
  let c: Canvas | undefined = undefined
  const healingEraserSize = ref<EraserSize>(EraserSize.small)
  const events: FabricEvent[] = []

  function init(canvas: Canvas) {
    c = canvas
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
  }

  watch(healingEraserSize, () => {
    c!.freeDrawingBrush.width = healingEraserSize.value
  })

  return { init, select, healingEraserSize, events }
})
