import { Canvas, StaticCanvas } from 'fabric'
import { ref } from 'vue'
import { canvasToBuffer, cloneCanvas, cropCanvas, exportBoundingBoxImage } from '@/draw/helpers/export.helper'

export function useCanvasPreview(getCanvas: () => Canvas) {
  const preview = ref<string>()
  const newPreview = ref<string>()
  const isLoading = ref<boolean>()

  let cachedCanvas: StaticCanvas | null = null
  let newCachedCanvas: StaticCanvas | null = null

  async function init() {
    isLoading.value = true
    const canvas = getCanvas()

    exportBoundingBoxImage(canvas).then(res => {
      preview.value = res?.img
    })

    cachedCanvas = await cloneCanvas(canvas)
    isLoading.value = false
  }

  async function crop(rect: any) {
    if (!cachedCanvas) return

    isLoading.value = true
    const result = await cropCanvas(cachedCanvas, rect)
    newPreview.value = result.image
    newCachedCanvas = result.json
    isLoading.value = false
  }

  function reset() {
    preview.value = undefined
    newPreview.value = undefined
    cachedCanvas = null
    newCachedCanvas = null
  }

  async function getDataToSend() {

    if (newCachedCanvas && newPreview.value) {
      const img = await canvasToBuffer(newPreview.value)
      return { canvas: newCachedCanvas.toJSON(), img }
    } else if (cachedCanvas && preview.value) {
      const img = await canvasToBuffer(preview.value)
      return { canvas: cachedCanvas.toJSON(), img }
    } else {
      const img = await canvasToBuffer(preview.value!)
      return {
        canvas: getCanvas().toJSON(), img: img
      }
    }


  }

  return { preview, newPreview, init, crop, reset, getDataToSend, isLoading }
}