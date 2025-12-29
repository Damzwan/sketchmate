import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { Mate } from '@/types/server.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { DrawSyncingAction, DrawSyncingEvent } from '@/draw/types/drawSyncing.types'
import { drawSyncingMapping } from '@/draw/config/drawSyncing.config'
import { FabricEvent } from '@/draw/types/draw.types'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { emitDrawSyncingActionHelper } from '@/service/api/socket/drawSyncing.socket'
import { FabricObject } from 'fabric'
import { toObjectsIds } from '@/draw/helpers/object.helper'
import { isText } from '@/draw/helpers/text.helper'
import { getObjectDiff } from '@/draw/helpers/history/object.helper'


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
        emitDrawSyncingActionHelper({ type: DrawSyncingEvent.added, params: { objectJSONS: [target.toJSON()] } })
      }
    },
    {
      on: 'objectsDeleted',
      handler: (e: any) => {
        const targets = e.target as FabricObject[]
        emitDrawSyncingActionHelper({ type: DrawSyncingEvent.removed, params: { objectIds: toObjectsIds(targets) } })
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

        emitDrawSyncingActionHelper({
            type: DrawSyncingEvent.modified,
            params: { objectIds: toObjectsIds(getCanvas().getActiveObjects()), transform: diff }
          }
        )
      }
    }
  ]

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
    const { actionWithoutEvents } = useDrawEventManager()
    await actionWithoutEvents(async () => {
      await drawSyncingMapping[action.type](action.params as any) // TODO fix typing
    })
  }

  function emitDrawSyncingAction(action: DrawSyncingAction) {
    emitDrawSyncingActionHelper(action)
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
    emitDrawSyncingAction
  }
})
