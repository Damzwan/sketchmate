import { Canvas } from 'fabric'
import {
  applyRenderDpr,
  changeFabricSettings,
  initCanvasOptions,
  overrideFindTarget,
  overrideHandleSelection,
  overrideMouseDown,
  overrideMouseUp,
  overrideTransform
} from '@/draw/helpers/fabricDefaults.helper'
import {
  getDefaultZoom,
  initViewport,
  resetZoom
} from '@/draw/helpers/viewport.helper'
import { BACKGROUND, CANVAS_SIZE } from '@/draw/config/canvas.config'
import { ref } from 'vue'
import { loadFonts } from '@/draw/helpers/text.helper'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'

export function useCanvasService() {
  let c: Canvas | null = null
  const backgroundColor = ref(BACKGROUND)

  function getCanvas(): Canvas {
    return c!
  }

  function destroyCanvas() {
    if (c) {
      try {
        c.dispose?.() // fabric >= x may have dispose
        c.destroy()
        c = null
      } catch (e) {
        // ignore
      }
    }
  }

  function createCanvas(canvasEl: HTMLCanvasElement): Canvas {
    destroyCanvas()

    // BEFORE `new Canvas`: fabric sizes the lower/upper backing stores in the
    // constructor from config.devicePixelRatio, so capping it afterwards (which
    // is where changeFabricSettings runs) would be too late and leave both
    // canvases at full device resolution. See renderQuality.config.ts.
    applyRenderDpr()

    const bbox = canvasEl.getBoundingClientRect()
    c = new Canvas(canvasEl, initCanvasOptions(bbox.width, bbox.height))

    // c.skipOffscreen = false TODO needed for rotations
    changeFabricSettings()
    overrideFindTarget(c)
    overrideTransform(c)
    overrideMouseUp(c)
    overrideMouseDown(c)
    overrideHandleSelection(c)
    initViewport(c)
    loadFonts()

    const z = 2
    const initX = (c.width - CANVAS_SIZE * z) / 2
    const initY = (c.height - CANVAS_SIZE * z) / 2
    c.setViewportTransform([z, 0, 0, z, initX, initY])

    return c
  }

  function resetCanvas() {
    if (!c) return
    const mgr = useDrawObjectManager()
    mgr.clearAllObjects()
    c.discardActiveObject()
    ;(c as any)._objects.length = 0

    c.backgroundColor = BACKGROUND
    backgroundColor.value = BACKGROUND
    const initX = (c.width - CANVAS_SIZE) / 2
    const initY = (c.height - CANVAS_SIZE) / 2
    c.setViewportTransform([1, 0, 0, 1, initX, initY])
  }

  return {
    getCanvas,
    createCanvas,
    destroyCanvas,
    resetCanvas,
    backgroundColor
  }
}
