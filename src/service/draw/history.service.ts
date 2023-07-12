import { Ref, ref } from 'vue'
import { findObjectById, setSelectionForObjects } from '@/helper/draw/draw.helper'
import { Canvas } from 'fabric/fabric-impl'
import { defineStore } from 'pinia'
import { useSelect } from '@/service/draw/tools/select.tool'
import { fabric } from 'fabric'
import { DrawEvent, DrawTool, FabricEvent, ObjectType, SelectedObject } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'
import { applyCurve } from '@/helper/draw/actions/text.action'
import { useDrawStore } from '@/store/draw/draw.store'

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
    c?.discardActiveObject()

    const currState = c!.toJSON()
    const previousState = sourceStack.value.pop()
    restoreCanvasFromHistory(previousState, selectedObjects)
    destStack.value.push(currState)
    c?.renderAll()
  }

  function undo() {
    executeUndoRedo(undoStack, redoStack)
  }

  function redo() {
    executeUndoRedo(redoStack, undoStack)
  }

  function restoreSelectedObjects(selectedObjects?: SelectedObject[]) {
    if (!selectedObjects) {
      const { getSelectedObjects } = useSelect()
      selectedObjects = getSelectedObjects()
    }
    const newSelectedObjects = selectedObjects
      .map((obj: any) => findObjectById(c!, obj.id)!)
      .filter((obj: any) => !!obj)
    if (newSelectedObjects.length > 1) c!.setActiveObject(new fabric.ActiveSelection(newSelectedObjects, { canvas: c }))
    else if (newSelectedObjects.length == 1) c?.setActiveObject(newSelectedObjects[0])
  }

  function restoreCanvasFromHistory(previousState: any, selectedObjects: SelectedObject[]) {
    disableAllEvents()
    c!.loadFromJSON(previousState, () => {
      c?.getObjects()
        .filter(obj => obj.type === ObjectType.text)
        .forEach((text: any) => (text.isCurved ? applyCurve(text, c!) : undefined))
      prevCanvasState = previousState

      const { selectedTool } = useDrawStore()
      setSelectionForObjects(c!.getObjects(), selectedTool === DrawTool.Select)
      restoreSelectedObjects(selectedObjects)
      enableAllEvents()
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
    clearHistory
  }
})
