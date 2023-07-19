import { defineStore, storeToRefs } from 'pinia'
import { DrawAction, DrawTool, Eraser, PenMenuTool, SelectToolOptions, ShapeCreationMode } from '@/types/draw.types'
import { ref, watch } from 'vue'
import { actionMapping, BACKGROUND, ERASERS, PENMENUTOOLS } from '@/config/draw/draw.config'
import { Canvas } from 'fabric/fabric-impl'
import { useAppStore } from '@/store/app.store'
import { useSocketService } from '@/service/api/socket.service'
import { InboxItem } from '@/types/server.types'
import { useRouter } from 'vue-router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { canvasToBuffer, resetZoom } from '@/helper/draw/draw.helper'
import { fabric } from 'fabric'
import { EventBus } from '@/main'
import { useMenuStore } from '@/store/draw/menu.store'
import { useLoadService } from '@/service/draw/load.service'
import {
  changeFabricBaseSettings,
  createTools,
  destroyTools,
  initCanvasOptions,
  initGestures,
  initTools
} from '@/helper/draw/init.helper'
import { useHistory } from '@/service/draw/history.service'
import { useEventManager } from '@/service/draw/eventManager.service'
import { loadAdditionalBrushes } from '@/utils/brushes'

export const useDrawStore = defineStore('draw', () => {
  const { user } = storeToRefs(useAppStore())
  const api = useSocketService()
  const router = useRouter()

  const { openToolMenu } = useMenuStore()

  let c: Canvas | undefined // needs to be a global variable

  // Tool services
  const tools = createTools()

  // Other services
  const loadService = useLoadService()
  const eventManager = useEventManager()
  const history = useHistory()

  // Selected tools
  const selectedTool = ref<DrawTool>(DrawTool.Pen)
  const lastSelectedPenMenuTool = ref<PenMenuTool>(DrawTool.Pen)
  const lastSelectedEraserTool = ref<Eraser>(DrawTool.MobileEraser)

  // Hammer
  const hammer = ref<HammerManager>()

  const loadingText = ref('')
  const shapeCreationMode = ref<ShapeCreationMode>()

  const canZoomOut = ref(false)
  const isEditingText = ref(false)
  const isLoading = ref(false)

  // We make use of events so we do not load the big draw.store in other views
  EventBus.on('reset-canvas', reset)

  function selectTool(newTool: DrawTool, options: SelectToolOptions | undefined = undefined) {
    const oldTool = selectedTool.value
    if (newTool != oldTool) {
      selectedTool.value = newTool
      if (ERASERS.includes(newTool)) lastSelectedEraserTool.value = newTool as Eraser
      if (PENMENUTOOLS.includes(newTool)) lastSelectedPenMenuTool.value = newTool as PenMenuTool
      eventManager.onToolSwitch(c!, tools[oldTool], tools[newTool])
    } else if (options && options.openMenu) {
      openToolMenu(newTool, options.e)
    }
    tools[newTool]?.select(c!)
    c?.renderAll()
  }

  function selectAction(action: DrawAction, options?: object) {
    actionMapping[action](c!, options)
  }

  async function initCanvas(canvas: HTMLCanvasElement) {
    let json: any = undefined
    if (c) {
      json = c.toJSON()
      destroyToolsAndServices()
      c.dispose()
    }

    c = new fabric.Canvas(canvas, initCanvasOptions())

    if (json) {
      await new Promise<void>(resolve => {
        c!.loadFromJSON(json, () => {
          resolve()
        })
      })
    }

    loadAdditionalBrushes()
    changeFabricBaseSettings(c)
    initGestures(c, hammer)
    eventManager.init(c)
    history.init(c)
    initTools(c, tools)

    selectTool(selectedTool.value, { openMenu: false })

    if (loadService.loading.value) {
      showLoading('Loading canvas')
      if (loadService.canvasToLoad.value) await loadService.loadCanvas(c)
    }
  }

  function destroyToolsAndServices() {
    destroyTools(tools)
    history.destroy()
    eventManager.destroy()
  }

  function showLoading(text: string) {
    loadingText.value = text
    isLoading.value = true
  }

  function hideLoading() {
    isLoading.value = false
  }

  async function send() {
    if (!c) return
    loadingText.value = 'Sending drawing...'
    isLoading.value = true
    resetZoom(c)

    await api.send({
      _id: user.value!._id,
      mate_id: user.value!.mate!._id,
      drawing: JSON.stringify(c.toJSON(['width', 'height'])),
      img: await canvasToBuffer(c.toDataURL({ multiplier: 2 })), // TODO multiplier 2 could be dangerous
      name: user.value!.name
    })
  }

  async function reply(inboxItem: InboxItem | undefined) {
    if (!inboxItem) return
    loadService.loading.value = true
    fetch(inboxItem.drawing)
      .then(res => res.json())
      .then(res => {
        loadService.canvasToLoad.value = res
        if (c) loadService.loadCanvas(c)
      })
    await router.push(FRONTEND_ROUTES.draw)
  }

  function getCanvas() {
    return c!
  }

  async function reset() {
    isLoading.value = false
    await history.actionWithoutHistory(() => {
      c?.clear()
      c!.backgroundColor = BACKGROUND
    })
    history.clearHistory()
    c?.renderAll()
  }

  function setShapeCreationMode(mode: ShapeCreationMode) {
    shapeCreationMode.value = mode
  }

  function setCanZoomOut(bool: boolean) {
    canZoomOut.value = bool
  }

  return {
    selectedTool,
    selectTool,
    lastSelectedEraserTool,
    send,
    reply,
    selectAction,
    getCanvas,
    loadingText,
    shapeCreationMode,
    setShapeCreationMode,
    hammer,
    canZoomOut,
    setCanZoomOut,
    initCanvas,
    isEditingText,
    isLoading,
    lastSelectedPenMenuTool,
    hideLoading
  }
})
