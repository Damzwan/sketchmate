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
import { getAbsoluteState, toJSON, toObjectsIds } from '@/draw/helpers/object.helper'
import { isText } from '@/draw/helpers/text.helper'
import { getObjectDiff } from '@/draw/helpers/history/object.helper'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { EventBus } from '@/main'
import { useSelect } from '@/draw/store/tools/select.store'
import { handleTextModificationSync } from '@/draw/helpers/history/text.helper'

export interface DrawInvitation {
  friend: Mate,
  roomId: string
}

export type LobbyChatItem =
  | {
  type: 'message'
  member: Mate
  message: string
  _id: string
  timestamp: string
}
  | {
  type: 'join'
  member: Mate
  _id: string
  timestamp: string
}
  | {
  type: 'leave'
  member: Mate
  _id: string
  timestamp: string
}


export interface LobbyChatEnterMessage {
  member: Mate,
  _id: string
  timestamp: string
}

export interface PublicLobby {
  id: string;
  name: string;
  users: number;
  maxUsers: number;
}

const handleUndo = (params: any) => {
  emitDrawSyncingEvent({
    type: DrawSyncingEvent.Undo,
    params: params as HistoryAction
  })
}

const handleRedo = (params: any) => {
  emitDrawSyncingEvent({
    type: DrawSyncingEvent.Redo,
    params: params as HistoryAction
  })
}


export const useDrawSyncer = defineStore('drawSyncer', () => {
  const roomMembers = ref<Mate[]>([])
  const roomId = ref<string>()
  const isCreator = ref<boolean>(false)
  const isTryingToJoin = ref<boolean>(false)
  const isLoadingCanvas = ref(false)
  const invitations = ref<DrawInvitation[]>([])
  const invitedFriends = ref<string[]>([])
  const lobbyChatMessages = ref<LobbyChatItem[]>([])
  const publicLobbies = ref<PublicLobby[]>([])
  const isWatchingPublicLobbies = ref<boolean>(false)
  const isPublicLobby = ref<boolean>(false)
  const publicLobbyName = ref<string>('')
  const disconnectedRoomId = ref<string>()
  const isProcessingQueue = ref(false)


  const actionQueue: DrawSyncingAction[] = []


  watch(roomId, (newRoomId) => {
    const { addEventsOfService, removeEventsOfService } = useDrawEventManager()
    if (!!newRoomId) {
      EventBus.off('undo', handleUndo)
      EventBus.off('redo', handleRedo)

      EventBus.on('undo', handleUndo)
      EventBus.on('redo', handleRedo)
      addEventsOfService('actionSyncer', events)


    } else {
      EventBus.off('undo', handleUndo)
      EventBus.off('redo', handleRedo)
      removeEventsOfService('actionSyncer')
    }
  })

  const events: FabricEvent[] = [
    {
      on: 'erasing:end',
      handler: (e: any) => {
        if (e.detail.targets.length == 0) return
        const targets = e.detail.targets as FabricObject[]
        const path = e.detail.path

        emitDrawSyncingEvent({
          type: DrawSyncingEvent.ErasingEnd,
          params: {
            objectIds: toObjectsIds(targets),
            erasePath: path.toJSON(['globalCompositeOperation', 'opacity', 'stroke'])
          }
        })
      }
    },
    {
      on: 'object:added',
      handler: (e: any) => {
        const target = e.target as FabricObject
        emitDrawSyncingEvent({ type: DrawSyncingEvent.added, params: { objectJSONS: [target.toJSON()] } })
      }
    },
    {
      on: 'objects:added',
      handler: (e: any) => {
        const targets = e.target as FabricObject[]
        emitDrawSyncingEvent({ type: DrawSyncingEvent.added, params: { objectJSONS: toJSON(targets) } })
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


        if (!e.transform && isText([obj])) {
          const action = handleTextModificationSync(obj)
          emitDrawSyncingEvent(action)
          return
        }

        const { getSelectedObjectOriginalStates } = useSelect()
        const originalStates = getSelectedObjectOriginalStates()

        const objects = getCanvas().getActiveObjects()

        const changes = objects.map(obj => {
          const original = originalStates.get(obj.id)
          const current = getAbsoluteState(obj)

          return {
            id: obj.id,
            forward: getObjectDiff(current, original),
            backward: getObjectDiff(original, current)
          }
        })


        emitDrawSyncingEvent({
            type: DrawSyncingEvent.modified,
            params: { changes: changes }
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
          params: { objectIds: e.objectIdsToClone, newObjectIds: e.newObjectIds }
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
    },
    {
      on: 'objectsMerged',
      handler: (e) => {
        emitDrawSyncingEvent({
          type: DrawSyncingEvent.ObjectsMerged,
          params: { mergedObjectIds: e.mergedObjectIds, groupId: e.objectIds[0] }
        })
      }
    }

  ]


  function init() {

  }


  async function loadRoomCanvas(canvasJSON: any) {
    const { reset, loadCanvas, getCanvas } = useDrawStore()
    reset(false)
    await loadCanvas(canvasJSON)


    if (actionQueue.length > 0) {
      await processActionQueue()
    }

    for (const action of actionQueue.reverse()) {
      await executeDrawSyncingAction(action)
    }

    getCanvas().requestRenderAll()
  }

  function addToDrawSyncingActionQueue(action: DrawSyncingAction) {
    actionQueue.push(action)
  }


  async function executeDrawSyncingAction(action: DrawSyncingAction) {
    actionQueue.push(action)

    // Only trigger processing if not already processing AND canvas is fully loaded
    if (!isProcessingQueue.value && !isLoadingCanvas.value) {
      processActionQueue()
    }
  }

  async function processActionQueue() {
    isProcessingQueue.value = true

    const { getCanvas } = useDrawStore()
    const { actionWithoutEvents } = useDrawEventManager()

    try {
      while (actionQueue.length > 0) {
        // shift() removes and returns the first element (FIFO)
        const action = actionQueue.shift()
        if (!action) continue

        await actionWithoutEvents(async () => {
          // @ts-ignore
          await drawSyncingMapping[action.type](action.params) // TODO fix typing
        })
      }
    } catch (error) {
      console.error('Error executing synced action:', error)
    } finally {
      // Call requestRenderAll exactly once per batch
      getCanvas().requestRenderAll()
      isProcessingQueue.value = false
    }
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
    init,
    invitations,
    invitedFriends,
    lobbyChatMessages,
    publicLobbies,
    isWatchingPublicLobbies,
    isPublicLobby,
    publicLobbyName,
    disconnectedRoomId
  }
})
