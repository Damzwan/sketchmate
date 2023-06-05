import { defineStore, storeToRefs } from 'pinia'
import { DrawEvent, DrawTool, FabricEvent, ToolService } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw/draw.store'
import { Canvas } from 'fabric/fabric-impl'
import { setObjectId, setObjectSelection, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { enableZoomAndPan } from '@/helper/draw/gesture.helper'
import { ref } from 'vue'

export const useEventManager = defineStore('event manager', () => {
  let c: Canvas | undefined
  const events = ref<Record<string, FabricEvent[]>>({})
  function init(canvas: Canvas) {
    c = canvas
    subscribe({
      on: 'object:added',
      handler: e => {
        setObjectId(e.target)
        const { selectedTool } = useDrawStore()
        setObjectSelection(e.target, selectedTool == DrawTool.Select)
      },
      type: DrawEvent.AddObjectIdOnCreated
    })
    enableZoomAndPan(c)
  }

  function onToolSwitch(c: Canvas, oldTool: ToolService, newTool: ToolService) {
    c.isDrawingMode = false
    c.selection = false
    setSelectionForObjects(c.getObjects(), false)

    const oldToolEvents = oldTool.events
    const newToolEvents = newTool.events

    oldToolEvents.forEach(e => unsubscribe(e))
    newToolEvents.forEach(e => subscribe(e))
  }

  function subscribe(event: FabricEvent) {
    c!.off(event.on)
    if (!events.value[event.on]) events.value[event.on] = []
    events.value[event.on].push(event)

    c!.on(event.on, (e: any) => events.value[event.on].forEach(ev => ev.handler(e)))
  }

  function unsubscribe(event: Omit<FabricEvent, 'handler'>) {
    c!.off(event.on)
    events.value[event.on] = events.value[event.on].filter(e => e.type != event.type)
    c!.on(event.on, (e: any) => events.value[event.on].forEach(ev => ev.handler(e)))
  }

  return { init, subscribe, unsubscribe, onToolSwitch, events }
})
