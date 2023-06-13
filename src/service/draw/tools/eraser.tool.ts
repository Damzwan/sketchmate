import { Ref, ref, watch } from 'vue'
import { EraserSize, FabricEvent, ToolService } from '@/types/draw.types'
import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'

interface Eraser extends ToolService {
  eraserSize: Ref<number>
}

export const useEraser = defineStore('eraser', (): Eraser => {
  let c: Canvas | undefined = undefined
  const eraserSize = ref<EraserSize>(EraserSize.small)
  const events: FabricEvent[] = []

  function init(canvas: Canvas) {
    c = canvas
  }

  async function select(canvas: Canvas) {
    canvas.isDrawingMode = true
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const b = new fabric.EraserBrush(canvas)
    canvas.freeDrawingBrush = b
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    canvas.freeDrawingBrush.inverted = false
    canvas.freeDrawingBrush.width = eraserSize.value
  }

  watch(eraserSize, () => {
    c!.freeDrawingBrush.width = eraserSize.value
  })

  return { init, select, eraserSize, events }
})
