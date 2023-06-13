import { ref } from 'vue'
import { findObjectById } from '@/helper/draw/draw.helper'
import { Canvas } from 'fabric/fabric-impl'
import { defineStore } from 'pinia'
import { useSelect } from '@/service/draw/tools/select.tool'
import { fabric } from 'fabric'
import { DrawEvent, FabricEvent, ObjectType } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'
import { applyCurve } from '@/helper/draw/actions/text.action'

export const useHistory = defineStore('history', () => {
  let c: Canvas | undefined = undefined
  let prevCanvasState: any
  const undoStack = ref<any[]>([])
  const redoStack = ref<any[]>([])
  const { subscribe, unsubscribe } = useEventManager()

  // 'erasing:end', 'after:transform', 'object:removed', 'object:added', 'object:modified'
  const events: FabricEvent[] = [
    {
      type: DrawEvent.SaveHistory,
      on: 'erasing:end',
      handler: (e: any) => (e.targets.length > 0 ? saveState() : undefined)
    },
    {
      type: DrawEvent.SaveHistory,
      on: 'after:transform',
      handler: () => saveState()
    },
    {
      type: DrawEvent.SaveHistory,
      on: 'object:removed',
      handler: () => saveState()
    },
    {
      type: DrawEvent.SaveHistory,
      on: 'object:added',
      handler: () => saveState()
    },
    {
      type: DrawEvent.SaveHistory,
      on: 'object:modified',
      handler: () => saveState()
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
    prevCanvasState = c.toJSON()
    enableEvents()
  }

  function enableEvents() {
    events.forEach(e => subscribe(e))
  }

  function disableEvents() {
    events.forEach(e => unsubscribe(e))
  }

  async function customSaveAction(action: () => void) {
    disableEvents()
    await action()
    saveState()
    enableEvents()
  }

  function undo() {
    if (undoStack.value.length == 0) return
    const currState = c!.toJSON()
    const previousState = undoStack.value.pop()
    restoreCanvasFromHistory(previousState)
    redoStack.value.push(currState)
  }

  function redo() {
    if (redoStack.value.length == 0) return
    const currState = c!.toJSON()
    const previousState = redoStack.value.pop()
    restoreCanvasFromHistory(previousState)
    undoStack.value.push(currState)
  }

  function restoreSelectedObjects() {
    const { lastSelectedObjects } = useSelect()
    const newSelectedObjects = lastSelectedObjects
      .map((obj: any) => findObjectById(c!, obj.id)!)
      .filter((obj: any) => !!obj)
    if (newSelectedObjects.length > 1) c!.setActiveObject(new fabric.ActiveSelection(newSelectedObjects, { canvas: c }))
    else if (newSelectedObjects.length == 1) c?.setActiveObject(newSelectedObjects[0])
  }

  function restoreCanvasFromHistory(previousState: any) {
    disableEvents()
    c!.loadFromJSON(previousState, () => {
      c?.getObjects()
        .filter(obj => obj.type === ObjectType.text)
        .forEach((text: any) => (text.isCurved ? applyCurve(text, c!) : undefined))
      prevCanvasState = previousState
      restoreSelectedObjects()
      enableEvents()
    })
  }

  function saveState() {
    console.log('saving state')
    undoStack.value.push(prevCanvasState!)
    prevCanvasState = c!.toJSON()
    redoStack.value = []
  }

  return {
    init,
    undoStack,
    redoStack,
    customSaveAction,
    undo,
    redo,
    disableHistorySaving: disableEvents,
    enableHistorySaving: enableEvents,
    saveState
  }
})
