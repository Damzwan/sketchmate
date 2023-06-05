import { ref } from 'vue'
import { fabric } from 'fabric'
import { useHistory } from '@/service/draw/history.service'

export function useLoadService() {
  const jsonToLoad = ref<JSON>()
  const { disableHistorySaving, enableHistorySaving } = useHistory()

  async function loadCanvas(c: fabric.Canvas) {
    disableHistorySaving()
    const json = jsonToLoad.value as any

    const scaleX = c.width! / json['width']
    const scaleY = c.height! / json['height']

    for (const obj of c.getObjects()) {
      obj.scaleX! *= scaleX
      obj.scaleY! *= scaleY
      obj.left! *= scaleX
      obj.top! *= scaleY
    }

    c!.setZoom(1) // Set zoom back to 1 after scaling
    jsonToLoad.value = undefined
    c!.renderAll() // Re-render the canvas
    enableHistorySaving()
  }

  return {
    jsonToLoad,
    loadCanvas
  }
}
