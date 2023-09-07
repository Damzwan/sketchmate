import { ref } from 'vue'
import { fabric } from 'fabric'

export function useLoadService() {
  const canvasToLoad = ref<string>()

  async function loadCanvas(c: fabric.Canvas) {
    if (!canvasToLoad.value) return
    const json = await fetch(canvasToLoad.value).then(res => res.json())

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
        canvasToLoad.value = undefined
        c!.renderAll() // Re-render the canvas
        resolve()
      })
    })
  }

  return {
    loadCanvas,
    canvasToLoad
  }
}
