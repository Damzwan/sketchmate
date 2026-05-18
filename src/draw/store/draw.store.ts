import { defineStore, storeToRefs } from 'pinia'
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
import { ref } from 'vue'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { computeBounds } from '@/draw/helpers/export.helper'
import { useCanvasPreview } from '@/draw/services/useCanvasPreview'
import { useDrawLoadStore } from '@/draw/store/drawLoad.store'
import { useGestureStore } from '@/draw/store/tools/gesture.store'

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


    const isGesturing = ref(false)
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

    async function initCanvas(
      el: HTMLCanvasElement,
      options: { isLobby: boolean; draftId?: string, canvasUrl?: string }
    ) {
      const { isLoadingCanvas } = storeToRefs(useDrawSyncer()) // TODO fking ugly :c
      isLoadingCanvas.value = true

      canvasSvc.destroyCanvas()
      drawUI.destroy()

      // 2. Create fresh Canvas instance
      const c = canvasSvc.createCanvas(el)

      // 3. Access our unified Load Store
      const loadStore = useDrawLoadStore()
      loadStore.init(c)
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
      await drawObjectManager.updateVisibility(true)
      isLoadingCanvas.value = false
    }

    async function selectAction<A extends DrawAction>(action: A, params: DrawActionParams[A]) {
      await drawActionMapping[action](params)
    }

    function reset() {
      canvasSvc.resetCanvas()
      drawHistory.reset()

      const gestureStore = useGestureStore()
      gestureStore.setRenderedVpt(canvasSvc.getCanvas().viewportTransform)
    }


    function getAspectRatio(): number {
      const c = canvasSvc.getCanvas()
      if (!c) return 0
      const bounds = computeBounds(c.getObjects())
      return bounds.width / bounds.height
    }


    return {
      initCanvas,
      reset,
      send,
      createBalloon,
      selectAction,
      getCanvas: canvasSvc.getCanvas,
      backgroundColor: canvasSvc.backgroundColor,
      prevDrawingMode,
      isSendingDrawing,
      getAspectRatio,
      isGesturing,
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
