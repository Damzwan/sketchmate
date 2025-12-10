import { Canvas } from 'fabric'
import { CANVAS_SIZE, BACKGROUND } from '@/draw/config/canvas.config'
import { initCanvasOptions, changeFabricSettings } from '@/draw/helpers/fabricDefaults.helper'
import { enableGestures } from '@/draw/helpers/gestures.helper'
import { resetZoom } from '@/draw/helpers/viewport.helper'

export function useCanvasService() {
  let c: Canvas | null = null

  function getCanvas(): Canvas {
    return c!
  }

  function destroyCanvas() {
    if (c) {
      c.destroy()
      c = null
    }
  }

  function createCanvas(el: HTMLCanvasElement) {
    const bbox = el.getBoundingClientRect()
    c = new Canvas(el, initCanvasOptions(bbox.width, bbox.height))
    changeFabricSettings()

    const initX = (c.width - CANVAS_SIZE) / 2
    const initY = (c.height - CANVAS_SIZE) / 2
    c.setViewportTransform([1, 0, 0, 1, initX, initY])

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
    c.renderAll()
  }

  return { getCanvas, createCanvas, destroyCanvas, resetCanvas }
}
