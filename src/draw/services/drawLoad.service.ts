import { ref } from 'vue'
import { ActiveSelection, Canvas } from 'fabric'
import { EventBus } from '@/main'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { centerObjectInViewport } from '@/draw/helpers/viewport.helper'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'

export function useLoadService() {
  const canvasToLoad = ref<string>()

  async function loadCanvas(c: Canvas) {
    if (!canvasToLoad.value) return
    const { isSendingDrawing } = storeToRefs(useDrawStore())
    const { actionWithoutEvents } = useDrawEventManager()

    isSendingDrawing.value = true
    const json = await fetch(canvasToLoad.value).then(res => res.json())


    // add backwards compatability
    if (json.version === '5.5.2') {
      delete json.width
      delete json.height
      json.objects = json.objects.filter((obj: any) => obj.id !== 'boundary')
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

    isSendingDrawing.value = false

  }

  return {
    loadCanvas,
    canvasToLoad
  }
}