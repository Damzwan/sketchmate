import { StaticCanvas } from 'fabric'
import { ref } from 'vue'
import {
  canvasToBuffer,
  cloneCanvas,
  cropCanvas,
  exportBoundingBoxImage,
  exportCroppedJson
} from '@/draw/helpers/export.helper'
import { useDrawStore } from '@/draw/store/draw.store'

export function useCanvasPreview() {
  const preview = ref<string>()
  const newPreview = ref<string>()
  const isLoading = ref<boolean>()


  let croppedRect: any
  let abortController: AbortController | null = null

  let cachedCanvas: StaticCanvas | null = null
  let aspect_ratio: number | undefined = undefined

  async function createPreview() {
    if (abortController) {
      abortController.abort()
    }

    // 2. Create a new controller for this specific execution
    abortController = new AbortController()
    const { signal } = abortController

    reset(false)
    isLoading.value = true

    const { getCanvas } = useDrawStore()
    const canvas = getCanvas()

    try {
      // Pass the signal into your helper
      const res = await exportBoundingBoxImage(canvas, { signal })

      // If we got here, the task wasn't aborted
      if (res) {
        preview.value = res.img as any
        aspect_ratio = res?.aspect_ratio
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Successfully cancelled preview generation.')
      } else {
        console.error('Preview error:', err)
      }
    } finally {
      // Only hide loading if this is still the active controller
      if (!signal.aborted) {
        isLoading.value = false
      }
    }

    // Still need to clone for cropping
    cachedCanvas = await cloneCanvas(canvas)
  }

  async function crop(rect: any) {
    if (!cachedCanvas) return

    if (rect.x === 0 && rect.y === 0 && rect.width === 1 && rect.height === 1) {
      newPreview.value = undefined
      croppedRect = undefined
      return
    }

    croppedRect = rect
    isLoading.value = true
    const result = await cropCanvas(cachedCanvas, rect)
    if (!result) return
    newPreview.value = result.img
    aspect_ratio = result.aspect_ratio
    isLoading.value = false
  }

  function reset(handleAbort = true) {
    if (abortController && handleAbort) abortController.abort()
    preview.value = undefined
    newPreview.value = undefined
    cachedCanvas = null
    croppedRect = undefined
  }

  async function getDataToSend() {

    if (croppedRect && cachedCanvas && newPreview.value) {
      const [img, croppedCanvasJSON] = await Promise.all([canvasToBuffer(newPreview.value), exportCroppedJson(cachedCanvas, croppedRect)])
      return { canvas: croppedCanvasJSON, img, aspect_ratio }
    } else if (cachedCanvas && preview.value) {
      const img = await canvasToBuffer(preview.value)
      return { canvas: cachedCanvas.toJSON(), img, aspect_ratio }
    } else {
      const img = await canvasToBuffer(preview.value!)
      const { getCanvas } = useDrawStore()

      return {
        canvas: getCanvas().toJSON(), img: img, aspect_ratio
      }
    }


  }

  return { preview, newPreview, createPreview, crop, reset, getDataToSend, isLoading }
}