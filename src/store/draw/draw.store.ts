import { defineStore, storeToRefs } from 'pinia'
import {
  DrawAction,
  DrawTool,
  Eraser,
  PenMenuTool,
  SelectTool,
  SelectToolOptions,
  ShapeCreationMode
} from '@/types/draw.types'
import { ref } from 'vue'
import { actionMapping, BACKGROUND, ERASERS, PENMENUTOOLS } from '@/config/draw/draw.config'
import { Canvas } from 'fabric/fabric-impl'
import { useAppStore } from '@/store/app.store'
import { useSocketService } from '@/service/api/socket.service'
import { InboxItem } from '@/types/server.types'
import { useRouter } from 'vue-router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import {
  activateRenderPanBoundaryListener,
  canvasToBuffer,
  disableRenderPanBoundaryListener,
  renderPanBoundary,
  resetZoom,
  restoreSelectedObjects
} from '@/helper/draw/draw.helper'
import { fabric } from 'fabric'
import { useMenuStore } from '@/store/draw/menu.store'
import { useLoadService } from '@/service/draw/load.service'
import {
  changeFabricBaseSettings,
  configureCanvasSpecificSettings,
  createTools,
  destroyTools,
  initCanvasOptions,
  initGestures,
  initTools
} from '@/helper/draw/init.helper'
import { useHistory } from '@/service/draw/history.service'
import { useEventManager } from '@/service/draw/eventManager.service'
import { loadAdditionalBrushes } from '@/utils/brushes'
import { Select } from '@/service/draw/tools/select.tool'
import { useBackgroundSaver } from '@/service/draw/backgroundSaved.service'
import { useShortcutManager } from '@/service/draw/shortcutManager'


export const useDrawStore = defineStore('draw', () => {
  const { user, isSendingDrawing } = storeToRefs(useAppStore())
  const api = useSocketService()
  const router = useRouter()

  const { openToolMenu } = useMenuStore()

  let c: Canvas | undefined // needs to be a global variable

  // Tool services
  const tools = createTools()

  // Other services
  const loadService = useLoadService()
  const eventManager = useEventManager()
  const backgroundSaver = useBackgroundSaver()
  const shortcutManager = useShortcutManager()
  const history = useHistory()

  // Selected tools
  const selectedTool = ref<DrawTool>(DrawTool.Pen)
  const lastSelectedPenMenuTool = ref<PenMenuTool>(DrawTool.Pen)
  const lastSelectedEraserTool = ref<Eraser>(DrawTool.MobileEraser)
  const lastSelectedSelectTool = ref<SelectTool>(DrawTool.Select)

  const loadingText = ref('')
  const shapeCreationMode = ref<ShapeCreationMode>()
  const colorPickerMode = ref(false)
  const addTextMode = ref(false)

  const canZoomOut = ref(false)
  const isEditingText = ref(false)
  const isLoading = ref(false)
  const isUsingGesture = ref(false)
  const backgroundColor = ref(BACKGROUND) // use ref for reactivity :(
  const showLoadingBackdrop = ref(false)


  // TODO I think we should transform shape creation into a store
  const shapeCreationSettings = ref<{
    stroke: string
    fill?: string
    backgroundColor?: string
    strokeWidth: number
  }>({
    stroke: '#000000',
    fill: undefined,
    backgroundColor: undefined,
    strokeWidth: 2
  })

  // We make use of events so we do not load the big draw.store in other views
  changeFabricBaseSettings()

  function selectTool(newTool: DrawTool, options: SelectToolOptions | undefined = undefined) {
    const oldTool = selectedTool.value
    if ((options && options?.init) || newTool != oldTool) {
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

  async function selectAction(action: DrawAction, options?: object) {
    await actionMapping[action](c!, options)
  }

  // TODO clean this up
  async function initCanvas(canvas: HTMLCanvasElement) {
    canZoomOut.value = false
    await backgroundSaver.init()

    let json: any = undefined
    const prevJson = await backgroundSaver.get()

    if (c) {
      json = c.toJSON()
      destroyToolsAndServices(!loadService.canvasToLoad.value)
      isEditingText.value = false
      c.dispose()
    }

    c = new fabric.Canvas(canvas, initCanvasOptions())

    if (loadService.canvasToLoad.value) {
      showLoading('Loading canvas')
      showLoadingBackdrop.value = true
      await loadService.loadCanvas(c)
      showLoadingBackdrop.value = false
    } else if (prevJson) {
      await new Promise<void>(resolve => {
        c!.loadFromJSON(prevJson, () => {
          resolve()
        })
      })
    } else if (json) {
      await new Promise<void>(resolve => {
        c!.loadFromJSON(json, () => {
          resolve()
        })
      })
    }

    // Important to init history after the canvas has been loaded to keep track off all objects
    eventManager.init(c)
    history.init(c)
    configureCanvasSpecificSettings(c)
    loadAdditionalBrushes()
    initGestures(c)
    initTools(c, tools)
    backgroundSaver.startSaving(c)
    shortcutManager.init(c)
    activateRenderPanBoundaryListener(c)

    const selected = (tools[DrawTool.Select] as Select).getSelectedObjects() // important that this is before selectTool
    selectTool(selectedTool.value, { init: true })

    if (json) restoreSelectedObjects(c!, selected)
    json = undefined
    hideLoading()
  }

  function destroyToolsAndServices(maintainHistory: boolean) {
    destroyTools(tools)
    history.destroy(maintainHistory)
    backgroundSaver.destroy()
    eventManager.destroy()
    shortcutManager.destroy()
    disableRenderPanBoundaryListener()
  }

  function showLoading(text: string) {
    loadingText.value = text
    isSendingDrawing.value = true
  }

  function hideLoading() {
    isSendingDrawing.value = false
  }

  async function send(matesToSend: string[]) {
    if (!c) return
    loadingText.value = 'Sending drawing...'
    isSendingDrawing.value = true
    resetZoom(c)

    await api.send({
      _id: user.value!._id,
      followers: [user.value!._id, ...matesToSend],
      drawing: JSON.stringify(c.toJSON(['width', 'height'])),
      img: await canvasToBuffer(c.toDataURL({ multiplier: 2 })), // TODO multiplier 2 could be dangerous
      name: user.value!.name,
      aspect_ratio: c.width! / c.height!
    })
    reset()
  }

  async function reply(inboxItem: InboxItem | undefined) {
    if (!inboxItem) return
    loadService.canvasToLoad.value = inboxItem.drawing
    await router.push(FRONTEND_ROUTES.draw)
  }

  function getCanvas() {
    return c!
  }

  async function reset() {
    await history.actionWithoutHistory(() => {
      c?.clear()
      backgroundColor.value = BACKGROUND
      c!.backgroundColor = backgroundColor.value
      renderPanBoundary()
    })
    history.clearHistory()
    backgroundSaver.clear()
    c?.renderAll()
  }

  function setShapeCreationMode(mode: ShapeCreationMode | undefined) {
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
    canZoomOut,
    setCanZoomOut,
    initCanvas,
    isEditingText,
    isLoading,
    lastSelectedPenMenuTool,
    isUsingGesture,
    shapeCreationSettings,
    lastSelectedSelectTool,
    colorPickerMode,
    addTextMode,
    backgroundColor,
    showLoadingBackdrop
  }
})
