import { Ref, ref } from 'vue'
import {
  exitEditing,
  findObjectById,
  isText,
  restoreSelectedObjects,
  setSelectionForObjects
} from '@/helper/draw/draw.helper'
import { Canvas } from 'fabric/fabric-impl'
import { defineStore } from 'pinia'
import { useSelect } from '@/service/draw/tools/select.tool'
import { fabric } from 'fabric'
import { DrawEvent, DrawTool, FabricEvent, ObjectType, SelectedObject } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'
import { applyCurve } from '@/helper/draw/actions/text.action'
import { useDrawStore } from '@/store/draw/draw.store'
import { EventBus } from '@/main'

export const useHistory = defineStore('history', () => {
  let c: Canvas | undefined = undefined
  let prevCanvasState: any
  const undoStack = ref<any[]>([])
  const redoStack = ref<any[]>([])
  const { subscribe, unsubscribe, disableAllEvents, enableAllEvents } = useEventManager()

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

  function destroy() {
    c = undefined
    prevCanvasState = undefined
    disableEvents()
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

  async function actionWithoutHistory(action: () => void) {
    disableEvents()
    await action()
    enableEvents()
  }

  function executeUndoRedo(sourceStack: Ref<any[]>, destStack: Ref<any[]>) {
    if (sourceStack.value.length == 0) return

    const { getSelectedObjects } = useSelect()
    const selectedObjects = getSelectedObjects()

    if (isText(selectedObjects)) exitEditing(selectedObjects[0])
    c?.discardActiveObject()

    const currState = c!.toJSON()
    const previousState = sourceStack.value.pop()
    restoreCanvasFromHistory(previousState, selectedObjects)
    destStack.value.push(currState)
    c?.renderAll()
  }

  function undo() {
    executeUndoRedo(undoStack, redoStack)
    EventBus.emit('undo')
  }

  function redo() {
    executeUndoRedo(redoStack, undoStack)
    EventBus.emit('redo')
  }

  function restoreCanvasFromHistory(previousState: any, selectedObjects: SelectedObject[]) {
    disableAllEvents()
    c!.loadFromJSON(previousState, () => {
      c?.renderAll()
      c?.getObjects().forEach(obj => (obj.visual ? c?.remove(obj) : undefined)) // remove visual indicators
      c?.getObjects()
        .filter(obj => obj.type === ObjectType.text)
        .forEach((text: any) => (text.isCurved ? applyCurve(text, c!) : undefined))
      prevCanvasState = previousState

      const { selectedTool } = useDrawStore()
      setSelectionForObjects(c!.getObjects(), selectedTool === DrawTool.Select)

      enableAllEvents()
      restoreSelectedObjects(c!, selectedObjects)
    })
  }

  function saveState() {
    console.log('saving state')
    undoStack.value.push(prevCanvasState!)
    prevCanvasState = c!.toJSON()
    redoStack.value = []
  }

  function clearHistory() {
    undoStack.value = []
    redoStack.value = []
    prevCanvasState = c!.toJSON()
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
    saveState,
    actionWithoutHistory,
    clearHistory,
    destroy
  }
})
