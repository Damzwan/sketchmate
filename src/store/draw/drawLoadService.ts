import { ref } from 'vue'
import { ActiveSelection, Canvas } from 'fabric'
import { EventBus } from '@/main'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'
import { centerObjectInViewport } from '@/helper/draw/draw.helper'

export function useLoadService() {
  const canvasToLoad = ref<string>()

  async function loadCanvas(c: Canvas) {
    if (!canvasToLoad.value) return
    const { actionWithoutEvents } = useDrawEventManager()
    const json = await fetch(canvasToLoad.value).then(res => res.json())


    // add backwards compatability
    if (json.version === '5.5.2') {
      delete json.width
      delete json.height
      json.objects = json.objects.filter(obj => obj.id !== 'boundary')
    }


    await actionWithoutEvents(async () => {

      c.clear()
      await c.loadFromJSON(json)
      canvasToLoad.value = undefined

      // add backwards compatability
      if (json.version === '5.5.2') {
        const selection = new ActiveSelection(c.getObjects(), { canvas: c })
        centerObjectInViewport(c, selection)
        selection.removeAll()
        selection.dispose()
      }

      EventBus.emit('saveDrawing', {})
    })

  }

  return {
    loadCanvas,
    canvasToLoad
  }
}