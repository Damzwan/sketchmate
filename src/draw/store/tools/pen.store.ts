import { defineStore } from 'pinia'
import { computed, ref, Ref, watch } from 'vue'
import { BrushType, FabricEvent, ToolService } from '@/draw/types/draw.types'
import { Canvas } from 'fabric'
import { hexWithOpacity, percentToAlphaHex } from '@/draw/utils/color.utils'
import { disableSelection2 } from '@/draw/helpers/select.helper'
import { updateFreeDrawingCursor } from '@/draw/helpers/tools/cursor.helper'
import { BASE_BRUSH_SIZE, BLACK } from '@/draw/config/canvas.config'
import { penBrushMapping } from '@/draw/config/tools.config'

interface Pen extends ToolService {
  brushSize: Ref<number>
  brushType: Ref<BrushType>
  brushColor: Ref<string>
  opacity: Ref<number>
  updatePenCursor: () => void
  brushColorWithOpacity: () => string
}

export const usePen = defineStore('pen', (): Pen => {
  let c: Canvas | undefined = undefined
  const brushSize = ref(BASE_BRUSH_SIZE)
  const brushType = ref<BrushType>(BrushType.Pencil)
  const brushColor = ref(BLACK)
  const opacity = ref(100)
  const events: FabricEvent[] = [
    {
      on: 'mouse:down',
      handler: updatePenCursor
    },
    {
      on: 'mouse:wheel',
      handler: updatePenCursor
    },
    {
      on: 'zoomReset',
      handler: (e: any) => {
        updatePenCursor()
      }
    }
  ]


  function init(canvas: Canvas) {
    c = canvas
    c.requestRenderAll()
  }

  async function select() {
    c!.isDrawingMode = true
    disableSelection2()
    c!.selection = false
    c!.freeDrawingBrush = penBrushMapping[brushType.value](c!)
    c!.freeDrawingBrush.width = brushSize.value
    c!.freeDrawingBrush.color = brushColorWithOpacity()
    updatePenCursor()
  }

  function brushColorWithOpacity() {
    return hexWithOpacity(brushColor.value.substring(0, 7), percentToAlphaHex(opacity.value))
  }

  function updatePenCursor() {
    updateFreeDrawingCursor(c!, brushSize.value, c!.freeDrawingBrush!.color)
  }

  watch(brushSize, () => {
    c!.freeDrawingBrush!.width = brushSize.value
    updatePenCursor()
  })

  watch(brushColor, () => {
    c!.freeDrawingBrush!.color = brushColorWithOpacity()
    updatePenCursor()
  })

  watch(opacity, () => {
    c!.freeDrawingBrush!.color = brushColorWithOpacity()
    updatePenCursor()
  })

  watch(brushType, () => {
    select()
  })

  return {
    select,
    init,
    brushSize,
    brushType,
    brushColor,
    events,
    opacity,
    updatePenCursor,
    brushColorWithOpacity
  }
})
