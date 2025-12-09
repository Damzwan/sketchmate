import { Canvas } from 'fabric'
import { ref, type Ref, watch } from 'vue'
import { EraserSize, FabricEvent, ToolService } from '@/types/draw.types'
import { defineStore } from 'pinia'
import { updateFreeDrawingCursor } from '@/helper/draw/draw.helper'
import { CustomEraserBrush } from '@/utils/brushes/CustomEraserBrush'
import { isMobile } from '@/helper/general.helper'


interface Eraser extends ToolService {
  eraserSize: Ref<number>
  cancelErase: () => void
}

export const useEraser = defineStore('eraser', (): Eraser => {
  let c: Canvas | undefined = undefined

  const eraserSize = ref<EraserSize>(EraserSize.small)
  let isCancelling = false

  const events: FabricEvent[] = [
    {
      on: 'mouse:wheel',
      handler: updateEraserCursor
    },
    {
      on: 'mouse:move',
      handler: (e: any) => {
        if (!isMobile()) return
        const pointer = e.pointer
        const ctx = c!.contextTop

        ctx.beginPath()

        ctx.arc(pointer.x, pointer.y, (eraserSize.value * c!.getZoom()) / 2, 0, 2 * Math.PI)
        ctx.strokeStyle = 'lightblue' // Adjust stroke color as needed

        const og = ctx.lineWidth
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.lineWidth = og
      }
    },
    {
      on: 'zoomReset',
      handler: (e: any) => {
        updateEraserCursor()
      }
    }
  ]


  function init(canvas: Canvas) {
    c = canvas
  }

  function updateEraserCursor() {
    updateFreeDrawingCursor(c!, eraserSize.value, c!.backgroundColor as string, true)
  }


  function cancelErase() {
    if (!c) return
    const brush = c.freeDrawingBrush as CustomEraserBrush
    if (!brush) return
    // isCancelling = true
    //
    // const fakeEvent: any = { pointer: new fabric.Point(0, 0), e: { isPrimary: true } }
    // brush.onMouseDown(fakeEvent.pointer, fakeEvent)
    // brush.onMouseUp(fakeEvent)
    // c.requestRenderAll()

    brush.cancel()
  }


  async function select() {
    c!.isDrawingMode = true
    c!.selection = false

    const b = new CustomEraserBrush(c!)

    b.width = eraserSize.value
    b.on('end', async (e) => {
      await b.commit(e.detail)
      if (isCancelling) {
        isCancelling = false
        console.log('cancelling')

        // e.detail.targets.forEach(target => {
        //   console.log()
        //   target.set('clipPath', null)
        // })
        // c.requestRenderAll()
      } else {
        c!.fire('erasing:end', e as any)
      }
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

  return { init, select, eraserSize, events, cancelErase }
})
