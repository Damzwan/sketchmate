import { Ref, ref, watch } from 'vue'
import { BLACK, BRUSHSIZE } from '@/config/draw/draw.config'
import { BrushType, DrawEvent, DrawTool, FabricEvent, ToolService } from '@/types/draw.types'
import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'
import { hexWithOpacity, percentToAlphaHex, updateFreeDrawingCursor } from '@/helper/draw/draw.helper'
import { EventBus } from '@/main'
import { useDrawStore } from '@/store/draw/draw.store'

interface Pen extends ToolService {
  brushSize: Ref<number>
  brushType: Ref<BrushType>
  brushColor: Ref<string>
  opacity: Ref<number>
  brushColorWithOpacity: () => string
  updatePenCursor: () => void
}

export const brushMapping: { [key in BrushType]: any } = {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  [BrushType.Circle]: (c: Canvas) => new fabric.CircleBrush(c),
  [BrushType.Pencil]: (c: Canvas) => new fabric.PencilBrush(c),
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  [BrushType.Ink]: (c: Canvas) => new fabric.InkBrush(c),
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  [BrushType.Spray]: (c: Canvas) => new fabric.SprayBrush(c),
  [BrushType.WaterColor]: (c: Canvas) => {
    const brush = new fabric.WaterColorBrush(c)
    brush.source = new Image() // weird bug but necessary :c
    return brush
  }
}

export const usePen = defineStore('pen', (): Pen => {
  let c: Canvas | undefined = undefined
  const brushSize = ref(BRUSHSIZE)
  const brushType = ref<BrushType>(BrushType.Pencil)
  const brushColor = ref(BLACK)
  const opacity = ref(100)
  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      type: DrawEvent.ShapeCreation,
      handler: updatePenCursor
    }
  ]

  EventBus.on('resetZoom', () => {
    const { selectedTool } = useDrawStore()
    if (selectedTool == DrawTool.Pen) updatePenCursor()
  })

  function init(canvas: Canvas) {
    c = canvas
  }

  function destroy() {
    c = undefined
  }

  async function select(c: Canvas) {
    c.isDrawingMode = true
    const newBrush = brushMapping[brushType.value](c)
    c.freeDrawingBrush = newBrush!
    c.freeDrawingBrush.width = brushSize.value
    c!.freeDrawingBrush.color = brushColorWithOpacity()
    updatePenCursor()
  }

  function brushColorWithOpacity() {
    return hexWithOpacity(brushColor.value.substring(0, 7), percentToAlphaHex(opacity.value))
  }

  function updatePenCursor() {
    updateFreeDrawingCursor(c!, c!.freeDrawingBrush.width, c!.freeDrawingBrush.color)
  }

  watch(brushSize, () => {
    c!.freeDrawingBrush.width = brushSize.value
    updatePenCursor()
  })

  watch(brushColor, () => {
    c!.freeDrawingBrush.color = brushColorWithOpacity()
    updatePenCursor()
  })

  watch(opacity, () => {
    c!.freeDrawingBrush.color = brushColorWithOpacity()
    updatePenCursor()
  })

  watch(brushType, () => {
    select(c!)
  })

  return {
    select,
    init,
    brushSize,
    brushType,
    brushColor,
    events: events,
    destroy,
    opacity,
    brushColorWithOpacity,
    updatePenCursor
  }
})
