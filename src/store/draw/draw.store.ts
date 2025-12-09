import { defineStore, storeToRefs } from 'pinia'
import {
  changeFabricSettings,
  createToolsMapping,
  enableGestures,
  initCanvasOptions, resetZoom
} from '@/helper/draw/drawInit.helper'
import { Canvas } from 'fabric'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'
import { DrawAction, DrawTool, PenMenuTool, SelectTool, SelectToolOptions, ShapeCreationMode } from '@/types/draw.types'
import { ref, watch } from 'vue'
import { useDrawHistoryManager } from '@/store/draw/drawHistoryManager.store'
import { BACKGROUND, CANVAS_SIZE, PENMENUTOOLS, SELECTMENUTOOLS } from '@/config/draw/draw.config'
import { useMenuStore } from '@/store/draw/menu.store'
import { CreateBalloonPostRes, InboxItem, Res } from '@/types/server.types'
import { canvasToBuffer, exportBoundingBoxImage } from '@/helper/draw/draw.helper'
import { useAPI } from '@/service/api/api.service'
import { useSocketService } from '@/service/api/socket.service'
import { useAuthStore } from '@/store/auth.store'
import { drawActionMapping } from '@/config/draw/drawAction.config'
import { useDrawProgressSaver } from '@/store/draw/drawProgressSaver'
import { fullErase } from '@/helper/draw/actions/erase.action'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { useLoadService } from '@/store/draw/drawLoadService'
import { useShortcutManager } from '@/store/draw/shortcutManager'
import { useDrawObjectManager } from '@/store/draw/DrawObjectManager.store'

export const useDrawStore = defineStore('draw', () => {
    let c: Canvas | undefined // needs to be a global variable

    const loadService = useLoadService()
    const drawEventManager = useDrawEventManager()
    const drawHistoryManager = useDrawHistoryManager()
    const drawProgressSaver = useDrawProgressSaver()
    const shortcutManager = useShortcutManager()
    const drawObjectManager = useDrawObjectManager()

    const lastSelectedPenMenuTool = ref<PenMenuTool>(DrawTool.Pen)
    const lastSelectedSelectTool = ref<SelectTool>(DrawTool.Select)
    const selectedTool = ref<DrawTool>(DrawTool.MobileEraser)

    const colorPickerMode = ref(false)
    const addTextMode = ref(false)
    const isEditingText = ref(false)
    const shapeCreationMode = ref<ShapeCreationMode>()

    const toolsMapping = createToolsMapping()

    const backgroundColor = ref(BACKGROUND) // use ref for reactivity :(
    const { isSendingDrawing } = storeToRefs(useAuthStore())
    const prevDrawingMode = ref(false) // ugly but used in case we cancel text adding mode

    const canResetView = ref(false)

    const api = useAPI()
    const socketAPI = useSocketService()

    // TODO migrate these properties to where they belong...
    const isLoading = ref(false)
    const loadingText = ref('')


    const { user } = storeToRefs(useAuthStore())

    changeFabricSettings()


    // TODO move this
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

    const { openToolMenu } = useMenuStore()


    async function initCanvas(canvas: HTMLCanvasElement) {
      if (c) {
        c.destroy()
        selectedTool.value = DrawTool.Select
      }


      const bbox = canvas.getBoundingClientRect()
      c = new Canvas(canvas, initCanvasOptions(bbox.width, bbox.height))


      const initX = (c.width - CANVAS_SIZE) / 2
      const initY = (c.height - CANVAS_SIZE) / 2
      c.setViewportTransform([1, 0, 0, 1, initX, initY])


      c.on('after:render', () => {
        if (!c) return
        const ctx = c.getContext()
        const dpr = window.devicePixelRatio || 1

        ctx.save()

        // Combine Fabric's DPR scaling + viewport transform
        if (c.viewportTransform) {
          const v = c.viewportTransform
          ctx.setTransform(
            v[0] * dpr,
            v[1] * dpr,
            v[2] * dpr,
            v[3] * dpr,
            v[4] * dpr,
            v[5] * dpr
          )
        } else {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }

        ctx.strokeStyle = '#B9463A'
        ctx.lineWidth = 10 // world-space size; works on all DPRs now

        ctx.strokeRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

        ctx.restore()
      })


      drawEventManager.init(c)
      await drawProgressSaver.init(c)

      const prevJson = await drawProgressSaver.get()

      if (loadService.canvasToLoad.value) {
        isSendingDrawing.value = true
        await loadService.loadCanvas(c)
        isSendingDrawing.value = false
      } else if (prevJson) {
        await c.loadFromJSON(prevJson)
      }


      drawProgressSaver.startSaving(c)
      enableGestures(c)

      drawHistoryManager.init(c)
      shortcutManager.init(c)
      drawObjectManager.init(c)

      for (const [, tool] of Object.entries(toolsMapping)) {
        tool.init(c)
      }

      selectTool(DrawTool.Pen)
      c.requestRenderAll()
    }

    function getCanvas() {
      return c!
    }

    function selectTool(newTool: DrawTool, options: SelectToolOptions | undefined = undefined) {
      const oldTool = selectedTool.value
      if (oldTool === newTool) {
        openToolMenu(newTool, options?.e)
      } else {
        selectedTool.value = newTool
        toolsMapping[newTool].select()
        drawEventManager.switchToolEvents(toolsMapping[newTool])
      }
    }

    async function selectAction(action: DrawAction, options?: any) {
      await drawActionMapping[action](options)
    }

    async function send(matesToSend: string[]) {
      if (!c) return
      isSendingDrawing.value = true

      const img = await exportBoundingBoxImage(c)
      if (!img) return

      await socketAPI.send({
        _id: user.value!._id,
        followers: [user.value!._id, ...matesToSend],
        drawing: JSON.stringify(c.toJSON()),
        img: await canvasToBuffer(img.img),
        name: user.value!.name,
        aspect_ratio: img.aspect_ratio
      })
      await reset()
    }

    async function createBalloon(message: string): Promise<Res<CreateBalloonPostRes>> {
      if (!c) return

      return await api.createBalloon({
        sender: user.value!._id,
        message,
        aspect_ratio: c.width! / c.height!,
        drawing: JSON.stringify(c.toJSON()),
        img: await canvasToBuffer(c.toDataURL({ multiplier: 2 }))
      })
    }

    async function reset() {
      if (!c) return
      c.clear()
      c.backgroundColor = BACKGROUND
      resetZoom()
      drawHistoryManager.reset()
      drawProgressSaver.clear()
      const initX = (c.width - CANVAS_SIZE) / 2
      const initY = (c.height - CANVAS_SIZE) / 2
      c.setViewportTransform([1, 0, 0, 1, initX, initY])
      c?.renderAll()
    }

    function setShapeCreationMode(mode: ShapeCreationMode | undefined) {
      shapeCreationMode.value = mode
    }

    async function reply(inboxItem: InboxItem | undefined) {
      if (!inboxItem) return
      loadService.canvasToLoad.value = inboxItem.drawing
      await router.push(FRONTEND_ROUTES.draw)


      if (c) {
        reset()
        isSendingDrawing.value = true // TODO use different name
        await loadService.loadCanvas(c)
        isSendingDrawing.value = false
        c.requestRenderAll()
      }
    }


    watch(selectedTool, () => {
      if (PENMENUTOOLS.includes(selectedTool.value)) lastSelectedPenMenuTool.value = selectedTool.value as PenMenuTool
      else if (SELECTMENUTOOLS.includes(selectedTool.value)) lastSelectedSelectTool.value = selectedTool.value as SelectTool
    })


    return {
      initCanvas,
      getCanvas,
      selectTool,
      selectedTool,
      colorPickerMode,
      addTextMode,
      shapeCreationMode,
      selectAction,
      shapeCreationSettings,
      lastSelectedPenMenuTool,
      lastSelectedSelectTool,
      isEditingText,
      send,
      createBalloon,
      backgroundColor,
      isLoading,
      loadingText,
      setShapeCreationMode,
      prevDrawingMode,
      canResetView,
      reply
    }
  }
)