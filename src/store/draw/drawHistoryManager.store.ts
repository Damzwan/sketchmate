import { defineStore } from 'pinia'
import { type Canvas, type FabricObject } from 'fabric'
import { ref } from 'vue'
import * as fabric from 'fabric'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'
import { DrawAction, FabricEvent } from '@/types/draw.types'
import { useSelect } from '@/store/draw/tools/select.store'
import { isText } from '@/helper/draw/draw.helper'
import { redoActionMapping, undoActionMapping } from '@/config/draw/undoredo.config'
import { EventBus } from '@/main'

// TODO should create custom events instead of copying fabric js
export type HistoryEvent =
  | 'objects:added'
  | 'object:added'
  | 'object:modified'
  | 'erasing'
  | 'merge'
  | 'fullErase'
  | 'moveObjectToFront'
  | 'moveObjectToBack'
  | 'moveObjectUpOneLayer'
  | 'moveObjectDownOneLayer'
  | 'flipX'
  | 'flipY'
  | 'objectsCopied'
  | 'objectsDeleted'
  | 'backgroundColorChanged'
  | 'textChanged'
  | 'textStyleChanged'
  | 'polygonCreation'
  | 'objectStyleChanged'
  | 'imgFilterChanged'

export interface HistoryAction {
  type: HistoryEvent
  objects: FabricObject[]
  options?: any
}

export const useDrawHistoryManager = defineStore('history', () => {
  let c: Canvas | undefined = undefined

  let undoStack: HistoryAction[] = []
  let redoStack: HistoryAction[] = []

  // instead of reffing the whole undo stack we only provide counters
  const undoStackCounter = ref(0)
  const redoStackCounter = ref(0)

  const { unSelect } = useSelect()

  const events: FabricEvent[] = [
    {
      on: 'erasing:end',
      handler: (e: any) => {
        if (e.detail.targets.length == 0) return
        const targets = e.detail.targets as FabricObject[]
        resetRedoStack()
        addToUndoStack({ type: 'erasing', objects: targets.map((o) => o.toJSON()) })
      }
    },
    {
      on: 'object:added',
      handler: (e: any) => {
        resetRedoStack()
        addToUndoStack({ type: 'object:added', objects: [e.target.toJSON()] })
      }
    },
    {
      on: 'objects:added',
      handler: (e: any) => {
        resetRedoStack()
        const targets = e.target as FabricObject[]

        addToUndoStack({ type: 'object:added', objects: targets.map((o) => o.toJSON()) })
      }
    },
    {
      on: 'objectsDeleted',
      handler: (e: any) => {
        resetRedoStack()
        const targets = e.target as FabricObject[]
        addToUndoStack({ type: 'objectsDeleted', objects: targets.map((o) => o.toJSON()) })
      }
    },
    {
      on: 'object:modified',
      handler: (e: any) => {
        const o = e.target

        if (!e.transform && isText([o])) {
          if (o.init) {
            addToUndoStack({ type: 'object:added', objects: [e.target.toJSON()] })
            o.init = false
          } else {
            o.oldText = o._textBeforeEdit
            addToUndoStack({ type: 'textChanged', objects: [o.toJSON()] })
          }
          return
        }

        const og = e.transform.original
        const diff = {
          left: o.left - og.left,
          top: o.top - og.top,
          scaleX: o.scaleX - og.scaleX,
          scaleY: o.scaleY - og.scaleY,
          angle: o.angle - og.angle
        }
        const activeObject = c!.getActiveObject()!.toJSON()
        resetRedoStack()
        addToUndoStack({
          type: 'object:modified',
          objects: [e.target.toJSON()],
          options: { diff, activeObject }
        })
      }
    },
    {
      on: 'fullErase',
      handler: (e: any) => {
        resetRedoStack()
        addToUndoStack({
          type: 'fullErase',
          objects: [],
          options: { prevCanvasJSON: e.prevCanvasJSON }
        })
      }
    },
    {
      on: 'layer:changed',
      handler: (e: any) => {
        const type = e.type as
          | DrawAction.MoveObjectUpOneLayer
          | DrawAction.MoveObjectDownOneLayer
          | DrawAction.MoveObjectToBack
          | DrawAction.MoveObjectToFront

        const typeMapping: Partial<Record<DrawAction, HistoryEvent>> = {
          [DrawAction.MoveObjectUpOneLayer]: 'moveObjectUpOneLayer',
          [DrawAction.MoveObjectDownOneLayer]: 'moveObjectDownOneLayer',
          [DrawAction.MoveObjectToFront]: 'moveObjectToFront',
          [DrawAction.MoveObjectToBack]: 'moveObjectToBack'
        }

        resetRedoStack()
        addToUndoStack({
          type: typeMapping[type]!,
          objects: e.target.map((o: any) => o.toJSON()),
          options: { prevObjectPositions: e?.prevObjectPositions }
        })
      }
    },
    {
      on: 'flip',
      handler: (e: any) => {
        resetRedoStack()
        addToUndoStack({
          type: e.direction,
          objects: e.target.map((o: any) => o.toJSON())
        })
      }
    },
    {
      on: 'objectsCopied',
      handler: (e: any) => {
        resetRedoStack()
        addToUndoStack({ type: 'objectsCopied', objects: e.target.map((o: any) => o.toJSON()) })
      }
    }, {
      on: 'backgroundColorChanged',
      handler: (e: any) => {
        resetRedoStack()
        addToUndoStack({ type: 'backgroundColorChanged', objects: [], options: { previousColor: e.previousColor } })
      }
    },
    {
      on: 'textStyleChanged',
      handler: (e: any) => {
        resetRedoStack()
        addToUndoStack({
          type: 'textStyleChanged',
          objects: e.target.map((o: any) => o.toJSON()),
          options: { prevStyle: e.prevStyle }
        })
      }
    },
    {
      on: 'objectStyleChanged',
      handler: (e: any) => {
        resetRedoStack()
        addToUndoStack({
          type: 'objectStyleChanged',
          objects: e.target.map((o: any) => o.toJSON()),
          options: { prevStyles: e.prevStyles }
        })
      }
    }, {
      on: 'imgFilterChanged',
      handler: (e: any) => {
        resetRedoStack()
        addToUndoStack({
          type: 'imgFilterChanged',
          objects: e.target.map((o: any) => o.toJSON()),
          options: { prevFilter: e.prevFilter }
        })
      }
    }


  ]

  const { actionWithoutEvents } = useDrawEventManager()

  async function undo() {
    if (undoStack.length == 0) return
    const action = undoStack.pop() as HistoryAction
    if (action.objects)
      action.objects = await fabric.util.enlivenObjects<FabricObject>(action.objects) // TODO ugly
    unSelect()
    await actionWithoutEvents(async () => await undoActionMapping[action.type](action))
    undoStackCounter.value = undoStack.length
    EventBus.emit('undo', action)
  }

  async function redo() {
    if (redoStack.length == 0) return
    const action = redoStack.pop() as HistoryAction
    if (action.objects)
      action.objects = await fabric.util.enlivenObjects<FabricObject>(action.objects) // TODO ugly
    unSelect()
    await actionWithoutEvents(async () => await redoActionMapping[action.type](action))
    redoStackCounter.value = redoStack.length
    EventBus.emit('redo', action)
  }

  function init(canvas: Canvas) {
    c = canvas

    const drawEventManager = useDrawEventManager()
    drawEventManager.addEventsOfService('history', events)
  }

  function resetUndoStack() {
    undoStack = []
    undoStackCounter.value = 0
  }

  function resetRedoStack() {
    redoStack = []
    redoStackCounter.value = 0
  }

  function addToUndoStack(action: HistoryAction) {
    console.log('addToUndoStack', action) // TODO only dev
    undoStack.push(action)
    undoStackCounter.value = undoStack.length
    EventBus.emit('add_to_undo_stack', action)

  }

  function addToRedoStack(action: HistoryAction) {
    redoStack.push(action)
    redoStackCounter.value = redoStack.length
  }

  function clearStackOfPolygonHistory() {
    undoStack = undoStack.filter((historyAction: HistoryAction) => historyAction.type !== 'polygonCreation')
    redoStack = redoStack.filter((historyAction: HistoryAction) => historyAction.type !== 'polygonCreation')
  }

  function reset() {
    resetUndoStack()
    resetRedoStack()
  }

  return {
    undo,
    redo,
    init,
    undoStackCounter,
    redoStackCounter,
    addToUndoStack,
    addToRedoStack,
    clearStackOfPolygonHistory,
    reset
  }
})
