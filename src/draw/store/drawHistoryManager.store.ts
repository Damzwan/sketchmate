import { defineStore } from 'pinia'
import { type Canvas, type FabricObject } from 'fabric'
import { ref } from 'vue'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { DrawAction, FabricEvent } from '@/draw/types/draw.types'
import { useSelect } from '@/draw/store/tools/select.store'
import { HistoryContext, redoActionMapping, undoActionMapping } from '@/draw/config/drawHistory.config'
import { EventBus } from '@/main'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { isText } from '@/draw/helpers/text.helper'
import { getAbsoluteState, toJSON, toObjectsIds } from '@/draw/helpers/object.helper'
import { handleTextModification } from '@/draw/helpers/history/text.helper'
import { getObjectDiff } from '@/draw/helpers/history/object.helper'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'


export const useDrawHistoryManager = defineStore('history', () => {
  let c: Canvas | undefined = undefined

  let undoStack: HistoryAction[] = []
  let redoStack: HistoryAction[] = []

  // instead of reffing the whole undo stack we only provide counters
  const undoStackCounter = ref(0)
  const redoStackCounter = ref(0)

  const MAX_HISTORY = 50


  const { updateQuadTree, updateVisibility, getObjectById, getObjectsById } = useDrawObjectManager()
  const { unSelect } = useSelect()

  const events: FabricEvent[] = [
    {
      on: 'erasing:end',
      handler: (e: any) => {
        if (e.detail.targets.length == 0) return
        const targets = e.detail.targets as FabricObject[]
        addToUndoStackWithResetRedo({
          type: HistoryEvent.Erasing,
          params: { objectIds: toObjectsIds(targets), prevClipPaths: targets.map(item => item.prevClipPath) }
        })
      }
    },
    {
      on: 'object:added',
      handler: (e: any) => {
        addToUndoStackWithResetRedo({ type: HistoryEvent.ObjectsAdded, params: { objectsJSON: [e.target.toJSON()] } })
      }
    },
    {
      on: 'objects:added',
      handler: (e: any) => {
        const targets = e.target as FabricObject[]
        addToUndoStackWithResetRedo({ type: HistoryEvent.ObjectsAdded, params: { objectsJSON: toJSON(targets) } })
      }
    },
    {
      on: 'objectsDeleted',
      handler: (e: any) => {
        const targets = e.target as FabricObject[]
        addToUndoStackWithResetRedo({ type: HistoryEvent.ObjectsDeleted, params: { objectsJSON: toJSON(targets) } })
      }
    },
    {
      on: 'object:modified',
      handler: (e: any) => {
        const obj = e.target

        // Handle text objects without a transform
        if (!e.transform && isText([obj])) {
          const action = handleTextModification(obj)
          addToUndoStack(action)
          return
        }


        const activeObject = c!.getActiveObject()!

        const objects = c!.getActiveObjects()

        const { getSelectedObjectOriginalStates } = useSelect()
        const originalStates = getSelectedObjectOriginalStates()

        const changes = objects.map(obj => {
          const original = originalStates.get(obj.id)
          const current = getAbsoluteState(obj)
          return {
            id: obj.id,
            forward: getObjectDiff(current, original),
            backward: getObjectDiff(original, current)
          }
        })

        addToUndoStackWithResetRedo({
          type: HistoryEvent.ObjectModified,
          params: {
            changes: changes,
            activeObjectId: activeObject?.id ?? null
          }
        })
      }
    },
    {
      on: 'fullErase',
      handler: (e: any) => {
        addToUndoStackWithResetRedo({
          type: HistoryEvent.FullErase,
          params: { prevCanvasJSON: e.prevCanvasJSON }
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
          [DrawAction.MoveObjectUpOneLayer]: HistoryEvent.MoveObjectUpOneLayer,
          [DrawAction.MoveObjectDownOneLayer]: HistoryEvent.MoveObjectDownOneLayer,
          [DrawAction.MoveObjectToFront]: HistoryEvent.MoveObjectToFront,
          [DrawAction.MoveObjectToBack]: HistoryEvent.MoveObjectToBack
        }

        addToUndoStackWithResetRedo({
          type: typeMapping[type]!,
          params: { objectIds: toObjectsIds(e.target), prevObjectPositions: e?.prevObjectPositions }
        })
      }
    },
    {
      on: 'flip',
      handler: (e: any) => {
        if (e.direction == HistoryEvent.FlipX) {
          addToUndoStackWithResetRedo({
            type: HistoryEvent.FlipX,
            params: { objectIds: toObjectsIds(e.target) }
          })
        } else if (e.direction == HistoryEvent.FlipY) {
          addToUndoStackWithResetRedo({
            type: HistoryEvent.FlipY,
            params: { objectIds: toObjectsIds(e.target) }
          })
        }

      }
    },
    {
      on: 'objectsCopied',
      handler: (e: any) => {
        addToUndoStackWithResetRedo({ type: HistoryEvent.ObjectsCopied, params: { objectsJSON: e.target } })
      }
    }, {
      on: 'backgroundColorChanged',
      handler: (e: any) => {
        addToUndoStackWithResetRedo({
          type: HistoryEvent.BackgroundColorChanged,
          params: { previousColor: e.previousColor }
        })
      }
    },
    {
      on: 'textStyleChanged',
      handler: (e: any) => {
        addToUndoStackWithResetRedo({
          type: HistoryEvent.TextStyleChanged,
          params: { prevStyle: e.prevStyle, objectId: toObjectsIds(e.target)[0], newStyle: null }
        })
      }
    },
    {
      on: 'objectStyleChanged',
      handler: (e: any) => {
        addToUndoStackWithResetRedo({
          type: HistoryEvent.ObjectStyleChanged,
          params: { prevStyles: e.prevStyles, objectIds: toObjectsIds(e.target), newStyles: null }
        })
      }
    }, {
      on: 'imgFilterChanged',
      handler: (e: any) => {
        addToUndoStackWithResetRedo({
          type: HistoryEvent.ImgFilterChanged,
          params: { prevFilter: e.prevFilter, objectId: e.target.id, newFilter: null, prevBlendColorFilter: e.prevBlendColorFilter }
        })
      }
    }, {
      on: 'objectsMerged',
      handler: (e: any) => {
        addToUndoStackWithResetRedo({ type: HistoryEvent.Merge, params: e })
      }
    }


  ]

  const { actionWithoutEvents } = useDrawEventManager()

  function createHistoryContext(): HistoryContext {
    const { getCanvas } = useDrawStore()

    return {
      canvas: getCanvas(),
      updateQuadTree,
      updateVisibility,
      unSelect,
      getObjectById,
      getObjectsById
    }
  }

  async function undo() {
    if (undoStack.length == 0) return

    const action = undoStack.pop() as HistoryAction

    unSelect()
    await actionWithoutEvents(async () => {
      const newAction = await undoActionMapping[action.type](createHistoryContext(), action as any)
      addToRedoStack(newAction)
    })
    undoStackCounter.value = undoStack.length

    EventBus.emit('undo', action)
  }

  async function redo() {
    if (redoStack.length == 0) return
    const action = redoStack.pop() as HistoryAction
    unSelect()
    await actionWithoutEvents(async () => {
      const newAction = await redoActionMapping[action.type](createHistoryContext(), action as any)
      addToUndoStack(newAction)
    })
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

  function addToUndoStackWithResetRedo<T extends HistoryEvent>(action: HistoryAction<T>) {
    resetRedoStack()
    addToUndoStack(action)
  }

  function addToUndoStack<T extends HistoryEvent>(action: HistoryAction<T>) {
    console.log('addToUndoStack', action.type)

    undoStack.push(action)
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift()
    }
    undoStackCounter.value = undoStack.length
    EventBus.emit('add_to_undo_stack', action)
  }

  function addToRedoStack<T extends HistoryEvent>(action: HistoryAction<T>) {
    console.log('addToRedoStack', action.type)

    redoStack.push(action)
    redoStackCounter.value = redoStack.length
  }

  function clearStackOfPolygonHistory() {
    undoStack = undoStack.filter((historyAction: HistoryAction) => historyAction.type !== HistoryEvent.PolygonCreation)
    redoStack = redoStack.filter((historyAction: HistoryAction) => historyAction.type !== HistoryEvent.PolygonCreation)
    undoStackCounter.value = undoStack.length
    redoStackCounter.value = redoStack.length
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
    reset,
    addToUndoStackWithResetRedo,
    createHistoryContext
  }
})
