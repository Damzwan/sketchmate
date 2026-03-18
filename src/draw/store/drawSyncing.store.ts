import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { Mate } from '@/types/server.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { DrawSyncingAction, DrawSyncingEvent } from '@/draw/types/drawSyncing.types'
import { drawSyncingMapping } from '@/draw/config/drawSyncing.config'
import { DrawAction, FabricEvent } from '@/draw/types/draw.types'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { emitDrawSyncingEvent } from '@/service/api/socket/drawSyncing.socket'
import { FabricObject } from 'fabric'
import { toJSON, toObjectsIds } from '@/draw/helpers/object.helper'
import { isText } from '@/draw/helpers/text.helper'
import { getObjectDiff } from '@/draw/helpers/history/object.helper'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { EventBus } from '@/main'


export const useDrawSyncer = defineStore('drawSyncer', () => {
  const roomMembers = ref<Mate[]>([])
  const roomId = ref<string>()
  const isCreator = ref<boolean>(false)
  const isTryingToJoin = ref<boolean>(false)
  const isLoadingCanvas = ref(false)

  const actionQueue: DrawSyncingAction[] = []

  watch(roomId, () => {
    const { addEventsOfService, removeEventsOfService } = useDrawEventManager()

    if (roomId.value !== null) addEventsOfService('actionSyncer', events)
    else removeEventsOfService('actionSyncer')
  })

  const events: FabricEvent[] = [
    {
      on: 'object:added',
      handler: (e: any) => {
        const target = e.target as FabricObject
        emitDrawSyncingEvent({ type: DrawSyncingEvent.added, params: { objectJSONS: [target.toJSON()] } })
      }
    },
    {
      on: 'objectsDeleted',
      handler: (e: any) => {
        const targets = e.target as FabricObject[]
        emitDrawSyncingEvent({ type: DrawSyncingEvent.removed, params: { objectIds: toObjectsIds(targets) } })
      }
    },
    {
      on: 'object:modified',
      handler: (e: any) => {
        const { getCanvas } = useDrawStore()

        const obj = e.target

        // handle text differently
        if (!e.transform && isText([obj])) {
          return
        }

        // Handle normal transform
        const original = e.transform.original
        const diff = getObjectDiff(obj, original, true)

        emitDrawSyncingEvent({
            type: DrawSyncingEvent.modified,
            params: { objectIds: toObjectsIds(getCanvas().getActiveObjects()), transform: diff }
          }
        )
      }
    },
    {
      on: 'fullErase',
      handler: () => {
        emitDrawSyncingEvent({
            type: DrawSyncingEvent.fullErase,
            params: undefined
          }
        )
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

        const typeMapping: Partial<Record<DrawAction, DrawSyncingEvent>> = {
          [DrawAction.MoveObjectUpOneLayer]: DrawSyncingEvent.MoveObjectUpOneLayer,
          [DrawAction.MoveObjectDownOneLayer]: DrawSyncingEvent.MoveObjectDownOneLayer,
          [DrawAction.MoveObjectToFront]: DrawSyncingEvent.MoveObjectToFront,
          [DrawAction.MoveObjectToBack]: DrawSyncingEvent.MoveObjectToBack
        }

        emitDrawSyncingEvent({
            type: typeMapping[type]!,
            params: { objectIds: toObjectsIds(e.target) }
          }
        )
      }
    },
    {
      on: 'flip',
      handler: (e: any) => {
        if (e.direction == HistoryEvent.FlipX) {
          emitDrawSyncingEvent({
              type: DrawSyncingEvent.FlipX,
              params: { objectIds: toObjectsIds(e.target) }
            }
          )
        } else if (e.direction == HistoryEvent.FlipY) {
          emitDrawSyncingEvent({
              type: DrawSyncingEvent.FlipY,
              params: { objectIds: toObjectsIds(e.target) }
            }
          )
        }

      }
    },
    {
      on: 'objectsCopied',
      handler: (e: any) => {
        emitDrawSyncingEvent({
          type: DrawSyncingEvent.ObjectsCopied,
          params: { objectsJSON: toJSON(e.target) }
        })
      }
    }, {
      on: 'backgroundColorChanged',
      handler: (e: any) => {
        emitDrawSyncingEvent({
          type: DrawSyncingEvent.BackgroundColorChanged,
          params: { color: e.color }
        })
      }
    },
    {
      on: 'textStyleChanged',
      handler: (e: any) => {
        emitDrawSyncingEvent({
          type: DrawSyncingEvent.TextStyleChanged,
          params: { style: e.style, objectId: toObjectsIds(e.target)[0] }
        })
      }
    },
    {
      on: 'objectStyleChanged',
      handler: (e: any) => {
        emitDrawSyncingEvent({
          type: DrawSyncingEvent.ObjectStyleChanged,
          params: { style: e.style, objectIds: toObjectsIds(e.target) }
        })
      }
    }, {
      on: 'imgFilterChanged',
      handler: (e: any) => {
        emitDrawSyncingEvent({
          type: DrawSyncingEvent.ImgFilterChanged,
          params: { filter: e.filter?.toJSON(), objectId: e.target.id }
        })
      }
    }

  ]

  EventBus.on('undo', (params: any) => {
    if (!roomId.value) return
    emitDrawSyncingEvent({
      type: DrawSyncingEvent.Undo,
      params: params as HistoryAction
    })
  })

  EventBus.on('redo', (params: any) => {
    if (!roomId.value) return
    emitDrawSyncingEvent({
      type: DrawSyncingEvent.Redo,
      params: params as HistoryAction
    })
  })

  function init() {
  }


  async function loadRoomCanvas(canvasJSON: any) {
    const { reset, loadCanvas, getCanvas } = useDrawStore()
    reset()
    await loadCanvas(canvasJSON)

    for (const action of actionQueue.reverse()) {
      await executeDrawSyncingAction(action)
    }

    getCanvas().requestRenderAll()
  }

  function addToDrawSyncingActionQueue(action: DrawSyncingAction) {
    actionQueue.push(action)
  }

  async function executeDrawSyncingAction(action: DrawSyncingAction) {
    const { getCanvas } = useDrawStore()

    const { actionWithoutEvents } = useDrawEventManager()
    await actionWithoutEvents(async () => {
      await drawSyncingMapping[action.type](action.params) // TODO fix typing
    })
    getCanvas().requestRenderAll() // TODO we should only call it here and not for every action...
  }


  return {
    roomMembers,
    roomId,
    isCreator,
    isTryingToJoin,
    loadRoomCanvas,
    isLoadingCanvas,
    addToDrawSyncingActionQueue,
    executeDrawSyncingAction,
    init
  }
})
