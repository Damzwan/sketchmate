import { defineStore } from 'pinia'
import type { Canvas } from 'fabric'
import type { FabricEvent, ToolService } from '@/types/draw.types.ts'

export const useDrawEventManager = defineStore('draw-event-manager', () => {
  let c: Canvas | undefined
  const eventsMapping: Record<string, FabricEvent[]> = {}

  function init(canvas: Canvas) {
    c = canvas
    eventsMapping['tool'] = []
  }

  function addEventsOfService(name: string, events: FabricEvent[]) {
    eventsMapping[name] = events
    events.forEach((ev) => c!.on(ev.on, ev.handler))
  }

  function addPermanentEvents(events: FabricEvent[]) {
    events.forEach((ev) => c!.on(ev.on, ev.handler))
  }

  function activateExclusiveEvents(events: FabricEvent[]) {
    for (const key in eventsMapping) {
      eventsMapping[key].forEach((ev) => c!.off(ev.on, ev.handler))
    }
    events.forEach((ev) => c!.on(ev.on, ev.handler))
    eventsMapping['exclusive'] = events
  }

  function deActivateExclusiveEvents() {
    for (const key in eventsMapping) {
      eventsMapping[key].forEach((ev) => c!.off(ev.on, ev.handler))
    }
    removeEventsOfService('exclusive')
    for (const key in eventsMapping) {
      eventsMapping[key].forEach((ev) => c!.on(ev.on, ev.handler))
    }
  }

  function removeEventsOfService(name: string) {
    if (!eventsMapping[name]) return
    const events = eventsMapping[name]
    events.forEach((ev) => c!.off(ev.on, ev.handler))
    delete eventsMapping[name]
  }

  function switchToolEvents(newTool: ToolService) {
    eventsMapping['tool'].forEach((ev) => c!.off(ev.on, ev.handler))
    eventsMapping['tool'] = newTool.events
    eventsMapping['tool'].forEach((ev) => c!.on(ev.on, ev.handler))
  }

  async function actionWithoutEvents(action: () => Promise<void> | void) {
    for (const key in eventsMapping) {
      eventsMapping[key].forEach((ev) => c!.off(ev.on, ev.handler))
    }
    await action()
    for (const key in eventsMapping) {
      eventsMapping[key].forEach((ev) => c!.on(ev.on, ev.handler))
    }
  }

  return {
    init,
    addEventsOfService,
    removeEventsOfService,
    switchToolEvents,
    actionWithoutEvents,
    activateExclusiveEvents,
    deActivateExclusiveEvents,
    addPermanentEvents
  }
})
