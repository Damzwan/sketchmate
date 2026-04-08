import { Canvas, StaticCanvas } from 'fabric'
import { ref } from 'vue'
import {
  canvasToBuffer,
  cloneCanvas,
  cropCanvas,
  exportBoundingBoxImage,
  exportCroppedJson
} from '@/draw/helpers/export.helper'

export function useCanvasPreview(getCanvas: () => Canvas) {
  const preview = ref<string>()
  const newPreview = ref<string>()
  const isLoading = ref<boolean>()

  let croppedRect: any

  let cachedCanvas: StaticCanvas | null = null
  let aspect_ratio: number | undefined = undefined

  async function init() {
    isLoading.value = true
    const canvas = getCanvas()

    exportBoundingBoxImage(canvas).then(res => {
      preview.value = res?.img
      aspect_ratio = res?.aspect_ratio
    })

    cachedCanvas = await cloneCanvas(canvas)
    isLoading.value = false
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

  function reset() {
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
      return {
        canvas: getCanvas().toJSON(), img: img, aspect_ratio
      }
    }


  }

  return { preview, newPreview, init, crop, reset, getDataToSend, isLoading }
}