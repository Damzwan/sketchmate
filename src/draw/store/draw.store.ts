import { defineStore } from 'pinia'
import { useDrawHistoryManager } from './drawHistoryManager.store'
import { useDrawSendService } from '@/draw/services/drawSend.service'
import { DrawAction, DrawActionParams, DrawTool } from '@/draw/types/draw.types'
import { useCanvasService } from '@/draw/services/canvas.service'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { drawActionMapping } from '@/draw/config/action.config'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { useShortcutManager } from '@/draw/services/shortcut.service'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { enableGestures } from '@/draw/helpers/gestures.helper'
import { InboxItem } from '@/types/server.types'
import { ref, shallowRef } from 'vue'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { computeBounds } from '@/draw/helpers/export.helper'
import { EventBus } from '@/main'
import { leaveRoom, socketJoinRoom } from '@/service/api/socket/drawSyncing.socket'
import { useHealthChecker } from '../services/healthChecker'
import { useCanvasPreview } from '@/draw/services/useCanvasPreview'
import { resetZoom } from '@/draw/helpers/viewport.helper'
import { useDrawLoadStore } from '@/draw/store/drawLoad.store'

const initialCssTransform = {
  scale: 1,
  translateX: 0,
  translateY: 0
}

export const useDrawStore = defineStore('draw', () => {
    const canvasSvc = useCanvasService()
    const toolSelection = useToolSelection()
    const drawObjectManager = useDrawObjectManager()
    const shortcutManager = useShortcutManager()
    const drawEventManager = useDrawEventManager()

    const drawHistory = useDrawHistoryManager()
    const drawSyncer = useDrawSyncer()
    const drawUI = useDrawUIStore()
    const healthChecker = useHealthChecker()


    const isGesturing = ref(false)
    const ghostBoxes = shallowRef<{ id: string; left: number; top: number; width: number; height: number }[]>([])
    const cssTransform = ref<any>({ ...initialCssTransform })
    const pendingCssTransform = ref<any>({ ...initialCssTransform })

    const {
      createPreview,
      preview,
      newPreview,
      crop,
      reset: resetPreview,
      getDataToSend,
      isLoading: isLoadingPreview
    } = useCanvasPreview()


    const { send, createBalloon, isSendingDrawing } = useDrawSendService(canvasSvc.getCanvas)

    const prevDrawingMode = ref(false) // TODO think of something better

    let canvasID = ''

    async function initCanvas(
      el: HTMLCanvasElement,
      options: { isLobby: boolean; draftId?: string, canvasUrl?: string }
    ) {
      // 1. Basic state cleanup
      canvasID = el.id

      canvasSvc.destroyCanvas()
      healthChecker.stopMonitoring()
      drawUI.destroy()

      // 2. Create fresh Canvas instance
      const c = canvasSvc.createCanvas(el)
      healthChecker.startMonitoring(c)

      // 3. Access our unified Load Store
      const loadStore = useDrawLoadStore()
      await loadStore.loadCanvas(c, options)

      // Sync the reactive background color to the store
      canvasSvc.backgroundColor.value = c.backgroundColor as string

      // 4. Initialize Managers
      drawEventManager.init(c)
      enableGestures(c)
      toolSelection.init(c)
      drawHistory.init(c)
      drawObjectManager.init(c)
      shortcutManager.init(c)
      drawSyncer.init()
      drawUI.init(c)


      toolSelection.selectTool(DrawTool.Pen, { skipOpenMenu: true })
      resetZoom()
    }

    async function selectAction<A extends DrawAction>(action: A, params: DrawActionParams[A]) {
      await drawActionMapping[action](params)
    }

    function reset() {
      canvasSvc.resetCanvas()
      drawHistory.reset()
    }

    async function loadCanvas(canvasJson: any) {
      // loadService.canvasToLoad.value = canvasJson
      // await loadService.loadCanvas(canvasSvc.getCanvas())
    }

    // TODO this should not be here
    async function reply(inboxItem: InboxItem) {
      // loadService.canvasToLoad.value = inboxItem.drawing
      // await router.push(FRONTEND_ROUTES.draw) // this will trigger the init logic again which will load in the canvas
    }

    function resetCanvasID() {
      canvasID = ''
    }


    function getAspectRatio(): number {
      const c = canvasSvc.getCanvas()
      if (!c) return 0
      const bounds = computeBounds(c.getObjects())
      return bounds.width / bounds.height
    }

    async function handleEmergencyRecovery() {
      canvasSvc.destroyCanvas()

      await new Promise(resolve => setTimeout(resolve, 100))
      const canvasEl = document.getElementById(canvasID) as HTMLCanvasElement

      if (canvasEl) {
        canvasID = ''
        await initCanvas(canvasEl, { isLobby: false, draftId: undefined })
      } else {
        console.error('CRITICAL: Could not find canvas element in the DOM to recover.')
      }

      const { roomId } = useDrawSyncer()
      if (roomId) {
        leaveRoom()
        socketJoinRoom({ roomId, intent: 'join' })
      }
    }

    EventBus.on('trigger_canvas_recovery', handleEmergencyRecovery)


    return {
      initCanvas,
      reset,
      send,
      createBalloon,
      selectAction,
      getCanvas: canvasSvc.getCanvas,
      backgroundColor: canvasSvc.backgroundColor,
      reply,
      prevDrawingMode,
      isSendingDrawing,
      loadCanvas,
      resetCanvasID,
      stopSaving: () => {
      },
      startSaving: () => {
      },
      getAspectRatio,
      isGesturing,
      ghostBoxes,
      cssTransform,
      createPreview,
      preview,
      newPreview,
      crop,
      resetPreview,
      getDataToSend,
      isLoadingPreview,
      pendingCssTransform
    }
  }
)
