import type { Canvas } from 'fabric'
import { ref, type Ref, watch } from 'vue'
import { isMobile } from '@/helper/general.helper'
import { EraserSize, FabricEvent, ToolService } from '@/types/draw.types'
import { defineStore } from 'pinia'
import { isMobileDevice } from '../../../../../sketchmate-canvas/src/helpers/general.helper'
import { updateFreeDrawingCursor } from '@/helper/draw/draw.helper'
import { EraserBrush } from '@erase2d/fabric'


interface Eraser extends ToolService {
  eraserSize: Ref<number>
}

export const useEraser = defineStore('eraser', (): Eraser => {
  let c: Canvas | undefined = undefined

  const eraserSize = ref<EraserSize>(EraserSize.small)

  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: updateEraserCursor
    },
    {
      on: 'mouse:move',
      handler: (e: any) => {
        if (!isMobileDevice()) return
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

  // EventBus.on('resetZoom', () => {
  //   const { selectedTool } = useDrawStore()
  //   if (selectedTool == DrawTool.MobileEraser) updateEraserCursor()
  // })

  function init(canvas: Canvas) {
    c = canvas
    // TODO remove
    // c.on('mouse:wheel', o => {
    //   o.stopPropagation()
    // })
  }

  function updateEraserCursor() {
    updateFreeDrawingCursor(c!, eraserSize.value, c!.backgroundColor as string, true)
  }

  async function select() {
    c!.isDrawingMode = true
    c!.selection = false
    // disableSelection()

    const b = new EraserBrush(c!)
    b.width = eraserSize.value
    b.on('end', async (e) => {
      await b.commit(e.detail)
      c!.fire('erasing:end', e as any)
    })

    // Needed for undo/redo to work
    b.on('start', async () => {
      c?.getObjects().forEach((obj) => {
        obj.set({
          prevClipPath: obj.clipPath?.toJSON()
        })
      })
    })

    c!.freeDrawingBrush = b
    updateEraserCursor()
  }

  watch(eraserSize, () => {
    c!.freeDrawingBrush!.width = eraserSize.value
    updateEraserCursor()
  })

  return { init, select, eraserSize, events }
})
