import { ref } from 'vue'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'

export function useLoadService() {
  const loading = ref(false)
  const canvasToLoad = ref()

  async function loadCanvas(c: fabric.Canvas) {
    const json = canvasToLoad.value!

    const w = c.width!
    const h = c.height!

    c.clear()

    await new Promise<void>(resolve => {
      c.loadFromJSON(json, () => {
        c.width = w
        c.height = h

        const scaleX = w / json['width']
        const scaleY = h / json['height']

        for (const obj of c.getObjects()) {
          obj.scaleX! *= scaleX
          obj.scaleY! *= scaleY
          obj.left! *= scaleX
          obj.top! *= scaleY
        }

        c!.setZoom(1) // Set zoom back to 1 after scaling
        loading.value = false
        const { hideLoading } = useDrawStore()
        hideLoading()
        c!.renderAll() // Re-render the canvas
        resolve()
      })
    })
  }

  return {
    loadCanvas,
    loading,
    canvasToLoad
  }
}
