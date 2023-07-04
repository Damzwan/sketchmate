import { ref } from 'vue'
import { fabric } from 'fabric'
import { useHistory } from '@/service/draw/history.service'
import { useDrawStore } from '@/store/draw/draw.store'

export function useLoadService() {
  const loading = ref(false)
  const { disableHistorySaving, enableHistorySaving } = useHistory()

  async function loadCanvas(c: fabric.Canvas, json: any) {
    disableHistorySaving()

    c.clear()
    c.loadFromJSON(json, () => {
      const scaleX = c.width! / json['width']
      const scaleY = c.height! / json['height']

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
      enableHistorySaving()
    })
  }

  return {
    loadCanvas,
    loading
  }
}
