import { Canvas } from 'fabric'
import {
  initCanvasOptions,
  changeFabricSettings,
  overrideFindTarget,
  initBorderRenderer
} from '@/draw/helpers/fabricDefaults.helper'
import { enableGestures } from '@/draw/helpers/gestures.helper'
import { initViewport, resetZoom } from '@/draw/helpers/viewport.helper'
import { CANVAS_SIZE, BACKGROUND } from '@/draw/config/canvas.config'

export function useCanvasService() {
  let c: Canvas | null = null

  function getCanvas(): Canvas | null {
    return c
  }

  function destroyCanvas() {
    if (c) {
      try {
        c.dispose?.() // fabric >= x may have dispose
      } catch (e) {
        // ignore
      }
      c.destroy()
      c = null
    }
  }

  function createCanvas(canvasEl: HTMLCanvasElement): Canvas {
    destroyCanvas()

    const bbox = canvasEl.getBoundingClientRect()
    c = new Canvas(canvasEl, initCanvasOptions(bbox.width, bbox.height))

    changeFabricSettings()
    overrideFindTarget(c)
    initViewport(c)
    initBorderRenderer(c)
    enableGestures(c)

    return c
  }

  function resetCanvas() {
    if (!c) return
    c.clear()
    c.backgroundColor = BACKGROUND
    resetZoom()
    const initX = (c.width - CANVAS_SIZE) / 2
    const initY = (c.height - CANVAS_SIZE) / 2
    c.setViewportTransform([1, 0, 0, 1, initX, initY])
    c.requestRenderAll()
  }

  return {
    getCanvas,
    createCanvas,
    destroyCanvas,
    resetCanvas
  }
}
