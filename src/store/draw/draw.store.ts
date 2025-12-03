import { defineStore, storeToRefs } from 'pinia'
import {
  changeFabricSettings,
  createToolsMapping,
  enableGestures,
  initCanvasOptions,
  makeCanvasContainerFitWindow
} from '@/helper/draw/drawInit.helper'
import { Canvas } from 'fabric'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'
import { DrawAction, DrawTool, PenMenuTool, SelectTool, SelectToolOptions, ShapeCreationMode } from '@/types/draw.types'
import { ref, watch } from 'vue'
import { useDrawHistoryManager } from '@/store/draw/drawHistoryManager.store'
import { BACKGROUND, PENMENUTOOLS, SELECTMENUTOOLS } from '@/config/draw/draw.config'
import { useMenuStore } from '@/store/draw/menu.store'
import { backgroundColor } from '@/config/colors.config'
import { CreateBalloonPostRes, Res } from '@/types/server.types'
import { canvasToBuffer, resetZoom } from '@/helper/draw/draw.helper'
import { useAPI } from '@/service/api/api.service'
import { useSocketService } from '@/service/api/socket.service'
import { useAuthStore } from '@/store/auth.store'
import { drawActionMapping } from '@/config/draw/drawAction.config'

export const useDrawStore = defineStore('draw', () => {
    let c: Canvas | undefined // needs to be a global variable

    const drawEventManager = useDrawEventManager()
    const drawHistoryManager = useDrawHistoryManager()

    const lastSelectedPenMenuTool = ref<PenMenuTool>(DrawTool.Pen)
    const lastSelectedSelectTool = ref<SelectTool>(DrawTool.Select)
    const selectedTool = ref<DrawTool>(DrawTool.Lasso)

    const colorPickerMode = ref(false)
    const addTextMode = ref(false)
    const isEditingText = ref(false)
    const shapeCreationMode = ref<ShapeCreationMode>()

    const toolsMapping = createToolsMapping()

    const backgroundColor = ref(BACKGROUND) // use ref for reactivity :(
    const isSendingDrawing = ref(false)
    const prevDrawingMode = ref(false) // ugly but used in case we cancel text adding mode

    const api = useAPI()
    const socketAPI = useSocketService()

    // TODO migrate these properties to where they belong...
    const isLoading = ref(false)
    const loadingText = ref('')

    const { user } = storeToRefs(useAuthStore())

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
      changeFabricSettings()
      c = new Canvas(canvas, initCanvasOptions())
      makeCanvasContainerFitWindow() // hide the actual size of the canvas...

      drawEventManager.init(c)
      drawHistoryManager.init(c)
      enableGestures(c)

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
      resetZoom(c)

      await socketAPI.send({
        _id: user.value!._id,
        followers: [user.value!._id, ...matesToSend],
        drawing: JSON.stringify(c.toJSON()),
        img: await canvasToBuffer(c.toDataURL({ multiplier: 2 })), // TODO multiplier 2 could be dangerous
        name: user.value!.name,
        aspect_ratio: c.width! / c.height!
      })
      reset()
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
      // await drawHistoryManager.actionWithoutHistory(() => {
      //   c?.clear()
      //   backgroundColor.value = BACKGROUND
      //   c!.backgroundColor = backgroundColor.value
      // })
      // drawHistoryManager.clearHistory()
      // backgroundSaver.clear()
      c?.renderAll()
    }

    function setShapeCreationMode(mode: ShapeCreationMode | undefined) {
      shapeCreationMode.value = mode
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
      prevDrawingMode
    }
  }
)