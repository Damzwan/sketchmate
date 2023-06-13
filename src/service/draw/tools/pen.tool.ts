import { Ref, ref, watch } from 'vue'
import { BLACK, BRUSHSIZE } from '@/config/draw.config'
import { BrushType, DrawEvent, FabricEvent, ToolService } from '@/types/draw.types'
import { setObjectSelection, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { Canvas, IPoint } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'
import { bucketFill } from '@/helper/draw/actions/bucket.action'
import { bringToBack } from '@/helper/draw/actions/operation.action'

interface Pen extends ToolService {
  brushSize: Ref<number>
  brushType: Ref<BrushType>
  brushColor: Ref<string>
}

export const brushMapping: { [key in BrushType]: any } = {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  [BrushType.Circle]: (c: Canvas) => new fabric.CircleBrush(c),
  [BrushType.Pencil]: (c: Canvas) => new fabric.PencilBrush(c),
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  [BrushType.Spray]: (c: Canvas) => new fabric.SprayBrush(c),
  [BrushType.Ink]: (c: Canvas) => new fabric.InkBrush(c)
}

export const usePen = defineStore('pen', (): Pen => {
  let c: Canvas | undefined = undefined
  const brushSize = ref(BRUSHSIZE)
  const brushType = ref<BrushType>(BrushType.Pencil)
  const brushColor = ref(BLACK)
  const events: FabricEvent[] = []

  function init(canvas: Canvas) {
    c = canvas
  }

  async function select(c: Canvas) {
    c.isDrawingMode = true
    const newBrush = brushMapping[brushType.value](c)
    c.freeDrawingBrush = newBrush!
    c.freeDrawingBrush.width = brushSize.value
    c.freeDrawingBrush.color = brushColor.value
  }

  watch(brushSize, () => {
    c!.freeDrawingBrush.width = brushSize.value
    // brush.value.width = brushSize.value
  })

  watch(brushColor, () => {
    c!.freeDrawingBrush.color = brushColor.value
  })

  watch(brushType, value => {
    select(c!)
  })

  return { select, init, brushSize, brushType, brushColor, events: events }
})
