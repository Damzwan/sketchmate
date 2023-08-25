import { defineStore } from 'pinia'
import { FabricEvent, ObjectType, ToolService } from '@/types/draw.types'
import { Canvas } from 'fabric/fabric-impl'
import { setSelectionForObjects } from '@/helper/draw/draw.helper'
import { enableZoomAndPan } from '@/helper/draw/gesture.helper'
import { ref } from 'vue'

export type EventObjectType = ObjectType | 'all'

export const useEventManager = defineStore('event manager', () => {
  let c: Canvas | undefined
  const events = ref<Record<string, FabricEvent[]>>({})

  function init(canvas: Canvas) {
    c = canvas
    enableZoomAndPan(c)
  }

  function destroy() {
    disableAllEvents()
    c = undefined
    events.value = {}
  }

  function onToolSwitch(c: Canvas, oldTool: ToolService, newTool: ToolService) {
    const oldToolEvents = oldTool.events
    const newToolEvents = newTool.events

    oldToolEvents.forEach(e => unsubscribe(e))
    newToolEvents.forEach(e => subscribe(e))

    c.isDrawingMode = false
    c.selection = false
    setSelectionForObjects(c.getObjects(), false)

    c.renderAll()
  }

  function subscribe(event: FabricEvent) {
    c!.off(event.on)
    if (!events.value[event.on]) events.value[event.on] = []
    events.value[event.on].push(event)

    c!.on(event.on, (e: any) => events.value[event.on].forEach(ev => ev.handler(e)))
  }

  function unsubscribe(event: Omit<FabricEvent, 'handler'>) {
    c!.off(event.on)
    if (!events.value[event.on]) return
    events.value[event.on] = events.value[event.on].filter(e => e.type != event.type)
    c!.on(event.on, (e: any) => events.value[event.on].forEach(ev => ev.handler(e)))
  }

  function isolatedSubscribe(event: FabricEvent) {
    c!.off(event.on)
    if (!events.value[event.on]) events.value[event.on] = []
    if (!events.value[event.on].find(ev => ev.type == event.type)) {
      events.value[event.on].push(event)
    }
    c!.on(event.on, (e: any) => event.handler(e))
  }

  function disableAllEvents() {
    for (const [eventType] of Object.entries(events.value)) {
      c!.off(eventType)
    }
  }

  function enableAllEvents() {
    disableAllEvents()
    for (const [eventOn, evs] of Object.entries(events.value)) {
      c!.on(eventOn, (e: any) => evs.forEach(ev => ev.handler(e)))
    }
  }

  async function actionWithoutEvents(action: () => void) {
    disableAllEvents()
    await action()
    enableAllEvents()
  }

  return {
    init,
    subscribe,
    unsubscribe,
    onToolSwitch,
    events,
    isolatedSubscribe,
    disableAllEvents,
    enableAllEvents,
    actionWithoutEvents,
    destroy
  }
})
