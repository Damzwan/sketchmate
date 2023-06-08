import { defineStore, storeToRefs } from 'pinia'
import { DrawAction, DrawTool, Eraser, SelectToolOptions, ShapeCreationMode, ToolService } from '@/types/draw.types'
import { ref } from 'vue'
import { actionMapping, ERASERS, WHITE } from '@/config/draw.config'
import { Canvas } from 'fabric/fabric-impl'
import { useAppStore } from '@/store/app.store'
import { useSocketService } from '@/service/api/socket.service'
import { InboxItem } from '@/types/server.types'
import { useRouter } from 'vue-router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { resetZoom } from '@/helper/draw/draw.helper'
import { fabric } from 'fabric'
import { EventBus } from '@/main'
import { useMenuStore } from '@/store/draw/menu.store'
import { useLoadService } from '@/service/draw/load.service'
import { changeFabricBaseSettings, initCanvasOptions, initGestures } from '@/helper/draw/init.helper'
import { usePen } from '@/service/draw/tools/pen.service'
import { useHealingEraser } from '@/service/draw/tools/healingEraser.service'
import { useEraser } from '@/service/draw/tools/eraser.service'
import { useSelect } from '@/service/draw/tools/select.service'
import { useHistory } from '@/service/draw/history.service'
import { useEventManager } from '@/service/draw/eventManager.service'
import { loadAdditionalBrushes } from '@/utils/brushes'

export const useDrawStore = defineStore('draw', () => {
  const { user, isLoading } = storeToRefs(useAppStore())
  const api = useSocketService()
  const router = useRouter()

  const { openToolMenu } = useMenuStore()

  let c: Canvas | undefined // needs to be a global variable

  // Tool services
  const pen = usePen()
  const eraser = useEraser()
  const healingEraser = useHealingEraser()
  const select = useSelect()

  // Other services
  const loadService = useLoadService()
  const eventManager = useEventManager()
  const history = useHistory()

  // Selected tools
  const selectedTool = ref<DrawTool>(DrawTool.MobileEraser)
  const lastSelectedEraserTool = ref<Eraser>(DrawTool.MobileEraser)

  // Hammer
  const hammer = ref<HammerManager>()

  const loadingText = ref('')
  const shapeCreationMode = ref<ShapeCreationMode>()

  const canZoomOut = ref(false)
  const isEditingText = ref(false)

  const toolMapping: { [key in DrawTool]: ToolService } = {
    [DrawTool.Pen]: pen,
    [DrawTool.MobileEraser]: eraser,
    [DrawTool.HealingEraser]: healingEraser,
    [DrawTool.Select]: select
  }

  // We make use of events so we do not load the big draw.store in other views
  EventBus.on('reset-canvas', reset)

  function selectTool(newTool: DrawTool, options: SelectToolOptions | undefined = undefined) {
    const oldTool = selectedTool.value
    if (newTool != oldTool) {
      selectedTool.value = newTool
      if (ERASERS.includes(newTool)) lastSelectedEraserTool.value = newTool as Eraser
      eventManager.onToolSwitch(c!, toolMapping[oldTool], toolMapping[newTool])
    } else if (options && options.openMenu) {
      openToolMenu(newTool, options.e)
    }
    toolMapping[newTool]?.select(c!)
    c?.renderAll()
  }

  function selectAction(action: DrawAction, options?: object) {
    actionMapping[action](c!, options)
  }

  async function initCanvas(canvas: HTMLCanvasElement) {
    if (!c) {
      changeFabricBaseSettings()
      loadAdditionalBrushes()
      c = new fabric.Canvas(canvas, initCanvasOptions())
      initGestures(c, hammer)
      eventManager.init(c)
      history.init(c)
      pen.init(c)
      eraser.init(c)
      healingEraser.init(c)
      select.init(c)
      selectTool(DrawTool.Pen)
    }
    if (loadService.jsonToLoad.value) await loadService.loadCanvas(c)
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
      img: c.toDataURL({ format: 'png', multiplier: 2 }),
      name: user.value!.name
    })
  }

  async function reply(inboxItem: InboxItem | undefined) {
    if (!inboxItem) return
    loadService.jsonToLoad.value = await fetch(inboxItem.drawing).then(res => res.json())
    await router.push(FRONTEND_ROUTES.draw)
  }

  function getCanvas() {
    return c!
  }

  function reset() {
    c?.clear()
    c!.backgroundColor = WHITE

    const { undoStack, redoStack } = storeToRefs(history)
    undoStack.value = []
    redoStack.value = []
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
    toolMapping,
    isEditingText
  }
})
