import { defineStore } from 'pinia'
import { useDrawHistoryManager } from './drawHistoryManager.store'
import { useDrawProgressSaver } from './tools/drawProgressSaver'
import { useDrawSendService } from '@/draw/services/drawSend.service'
import { DrawAction, DrawActionParams, DrawTool } from '@/draw/types/draw.types'
import { useCanvasService } from '@/draw/services/canvas.service'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { drawActionMapping } from '@/draw/config/action.config'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { useShortcutManager } from '@/draw/services/shortcut.service'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { useLoadService } from '@/draw/services/drawLoad.service'
import { enableGestures } from '@/draw/helpers/gestures.helper'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { InboxItem } from '@/types/server.types'
import { ref } from 'vue'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { computeBounds } from '@/draw/helpers/export.helper'

export const useDrawStore = defineStore('draw', () => {
    const canvasSvc = useCanvasService()
    const toolSelection = useToolSelection()
    const drawObjectManager = useDrawObjectManager()
    const shortcutManager = useShortcutManager()
    const drawEventManager = useDrawEventManager()
    const loadService = useLoadService()

    const drawHistory = useDrawHistoryManager()
    const progressSaver = useDrawProgressSaver()
    const drawSyncer = useDrawSyncer()
    const drawUI = useDrawUIStore()

    const isCanvasInit = ref(false)


    const { send, createBalloon, isSendingDrawing } = useDrawSendService(canvasSvc.getCanvas)

    const isModal = ref(false)
    const prevDrawingMode = ref(false) // TODO think of something better

    let canvasID = ''

    async function initCanvas(el: HTMLCanvasElement, isAModal?: boolean) {
      // in case we return to the same canvas we do not need to reload the whole canvas, it causes for flickering
      if (canvasID === el.id) {
        const c = canvasSvc.getCanvas()
        if (loadService.canvasToLoad.value) await loadService.loadCanvas(c)
        drawObjectManager.updateVisibility(true)
        return
      }

      isCanvasInit.value = false

      canvasID = el.id

      isModal.value = !!isAModal
      canvasSvc.destroyCanvas()
      const c = canvasSvc.createCanvas(el)

      await progressSaver.init(c)
      progressSaver.startSaving(c)

      const prevJson = await progressSaver.get()
      if (loadService.canvasToLoad.value) {
        await loadService.loadCanvas(c)
      } else if (prevJson) {
        await c.loadFromJSON(prevJson)
      }

      drawEventManager.init(c)
      enableGestures(c)
      toolSelection.init(c)
      drawHistory.init(c)
      drawObjectManager.init(c)
      shortcutManager.init(c)
      drawSyncer.init()
      drawUI.init()


      toolSelection.selectTool(DrawTool.Pen, { skipOpenMenu: true })
      requestAnimationFrame(() => {
        c.requestRenderAll()
      })


      isCanvasInit.value = true
    }

    async function selectAction<A extends DrawAction>(action: A, params: DrawActionParams[A]) {
      await drawActionMapping[action](params)
    }

    function reset(resetProgressSaver = true) {
      canvasSvc.resetCanvas()
      drawHistory.reset()
      if (resetProgressSaver) progressSaver.clear()
    }

    async function loadCanvas(canvasJson: any) {
      loadService.canvasToLoad.value = canvasJson
      await loadService.loadCanvas(canvasSvc.getCanvas())
    }

    // TODO this should not be here
    async function reply(inboxItem: InboxItem) {
      loadService.canvasToLoad.value = inboxItem.drawing
      await router.push(FRONTEND_ROUTES.draw) // this will trigger the init logic again which will load in the canvas
    }

    function resetCanvasID() {
      canvasID = ''
    }

    // TODO maybe not best place but has all the references :c
    async function restoreLocalCanvas() {
      const prevJson = await progressSaver.get()
      if (!prevJson) {
        canvasSvc.resetCanvas()
        return
      }
      await canvasSvc.getCanvas().loadFromJSON(prevJson)
      canvasSvc.getCanvas().requestRenderAll()
      drawHistory.reset()
    }

    function getAspectRatio(): number {
      const c = canvasSvc.getCanvas()
      if (!c) return 0
      const bounds = computeBounds(c.getObjects())
      return bounds.width / bounds.height
    }


    return {
      isModal,
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
      stopSaving: progressSaver.stopSaving,
      startSaving: progressSaver.startSaving,
      restoreLocalCanvas,
      isCanvasInit,
      clearSavedCanvas: progressSaver.clear,
      getAspectRatio
    }
  }
)
