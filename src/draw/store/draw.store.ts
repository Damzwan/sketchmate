import { defineStore } from 'pinia'
import { useDrawHistoryManager } from './drawHistoryManager.store'
import { useDrawProgressSaver } from './tools/drawProgressSaver'
import { useDrawSendService } from '@/draw/services/drawSend.service'
import { DrawAction, DrawActionParams, DrawTool } from '@/draw/types/draw.types'
import { useCanvasService } from '@/draw/services/canvas.service'
import { useToolSelectionStore } from '@/draw/store/tools/toolSelection.store'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { useShapeCreationStore } from '@/draw/store/shapeCreation.store'
import { drawActionMapping } from '@/draw/config/action.config'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { useShortcutManager } from '@/draw/services/shortcut.service'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'

export const useDrawStore = defineStore('draw', () => {
  const canvasSvc = useCanvasService()
  const toolSelection = useToolSelectionStore()
  const ui = useDrawUIStore()
  const shape = useShapeCreationStore()
  const drawObjectManager = useDrawObjectManager()
  const shortcutManager = useShortcutManager()
  const drawEventManager = useDrawEventManager()
  // const loadService = useLoadService()

  const drawHistory = useDrawHistoryManager()
  const progressSaver = useDrawProgressSaver()

  const { send, createBalloon } = useDrawSendService(canvasSvc.getCanvas)

  async function initCanvas(el: HTMLCanvasElement) {
    canvasSvc.destroyCanvas()
    const c = canvasSvc.createCanvas(el)
    drawEventManager.init(c)
    toolSelection.init(c)
    progressSaver.init(c)
    drawHistory.init(c)
    drawObjectManager.init(c)
    shortcutManager.init(c)


    toolSelection.selectTool(DrawTool.Pen)
    c.requestRenderAll()
  }

  async function selectAction<A extends DrawAction>(action: A, params: DrawActionParams[A]) {
    await drawActionMapping[action](params)
  }

  function reset() {
    canvasSvc.resetCanvas()
    drawHistory.reset()
    progressSaver.clear()
  }

  return {
    initCanvas,
    reset,
    send,
    createBalloon,
    getCanvas: canvasSvc.getCanvas,

    ...toolSelection,
    ...ui,
    ...shape
  }
})
