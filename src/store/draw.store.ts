import { defineStore, storeToRefs } from 'pinia'
import { BrushType, DrawAction, DrawTool, Eraser, EraserSize, Pen } from '@/types/draw.types'
import { ref, watch } from 'vue'
import { actionMapping, BLACK, BRUSHSIZE, selectToolMapping, TEXTCOLOR, TEXTSIZE, WHITE } from '@/config/draw.config'
import { Canvas } from 'fabric/fabric-impl'
import { useAppStore } from '@/store/app.store'
import { useSocketService } from '@/service/socket.service'
import { InboxItem } from '@/types/server.types'
import { useRouter } from 'vue-router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import {
  disableHistorySaving,
  enableHistorySaving,
  enableObjectIdSaving,
  findObjectById,
  resetCanvasMode,
  resetZoom,
  selectPen
} from '@/helper/draw.helper'
import { fabric } from 'fabric'
import { EventBus } from '@/main'

export const useDrawStore = defineStore('draw', () => {
  const { user } = storeToRefs(useAppStore())
  const api = useSocketService()
  const router = useRouter()

  const backgroundColor = ref(WHITE)
  const isDrawingMode = ref(true)
  const brushSize = ref(BRUSHSIZE)
  const brushType = ref<BrushType>(BrushType.Pencil)
  const brushColor = ref(BLACK)

  const eraserSize = ref<EraserSize>(EraserSize.small)
  const healingEraserSize = ref<EraserSize>(EraserSize.small)

  const stickers = ref<string[]>([])
  const textBoxes = ref<string[]>([])
  const textSize = ref(TEXTSIZE)
  const textColor = ref(TEXTCOLOR)

  // Different from pen since we need to select the pen in draw.view.vue
  const selectedTool = ref<DrawTool>(DrawTool.Pen)
  const lastSelectedPenTool = ref<Pen>(DrawTool.Pen)
  const lastSelectedEraserTool = ref<Eraser>(DrawTool.MobileEraser)

  // refs do not work that well with fabric.js. We need both
  let selectedObjects: Array<fabric.Object> = []
  const selectedObjectsRef = ref<fabric.Object[]>([])

  const jsonToLoad = ref<JSON>()
  let c: Canvas | undefined // needs to be a global variable
  const event = ref<Event>() // used by ion-popover to position itself

  const penMenuOpen = ref(false)
  const eraserMenuOpen = ref(false)
  const bucketMenuOpen = ref(false)
  const stickerMenuOpen = ref(false)

  const openMenuMapping: { [key in DrawTool]: (() => void) | undefined } = {
    [DrawTool.Pen]: () => (penMenuOpen.value = true),
    [DrawTool.MobileEraser]: () => (eraserMenuOpen.value = true),
    [DrawTool.HealingEraser]: () => (eraserMenuOpen.value = true),
    [DrawTool.Move]: undefined,
    [DrawTool.Select]: undefined
  }

  const selectedObjectStrokeColor = ref(BLACK)
  const selectedObjectFillColor = ref(BLACK)
  const selectedBackgroundColor = ref(BLACK)

  let prevCanvasState: any
  const undoStack = ref<any[]>([])
  const redoStack = ref<any[]>([])

  EventBus.on('reset-canvas', reset)

  function selectTool(newTool: DrawTool, e: Event | undefined = undefined) {
    event.value = e
    if (newTool != selectedTool.value) {
      resetCanvasMode(c!)
      selectedTool.value = newTool
    } else {
      const openMenu = openMenuMapping[newTool]
      if (openMenu) openMenu()
    }
    selectToolMapping[newTool](c!)
  }

  function selectAction(action: DrawAction, options?: object) {
    actionMapping[action](c!, options)
  }

  function storeCanvas(canvas: Canvas) {
    c = canvas
    prevCanvasState = c.toJSON()
  }

  function retrieveCanvas() {
    return c
  }

  function setLastSelectedEraser(eraser: Eraser) {
    lastSelectedEraserTool.value = eraser
  }

  function deleteObjects(objects: fabric.Object[]) {
    disableHistorySaving(c!)
    objects.forEach(obj => c?.remove(obj))
    saveState()
    enableHistorySaving(c!)
  }

  async function send() {
    if (!c) return
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
    jsonToLoad.value = await fetch(inboxItem.drawing).then(res => res.json())
    await router.push(FRONTEND_ROUTES.draw)
  }

  function getCanvas() {
    return c!
  }

  function setSelectedObjects(objects: fabric.Object[] | undefined, isTouchEvent = false) {
    if (!objects) objects = []

    // TODO remove this or place this somewhere else
    if (objects?.length == 1) {
      selectedObjectFillColor.value = objects[0].fill ? (objects[0].fill as string) : BLACK
      selectedObjectStrokeColor.value = objects[0].stroke!
      selectedBackgroundColor.value = objects[0].backgroundColor!
    } else {
      selectedObjectFillColor.value = BLACK
      selectedObjectStrokeColor.value = BLACK
      selectedBackgroundColor.value = BLACK
    }

    // objects.forEach(obj => obj.set({ hasBorders: true, hasControls: true }))

    if (objects.length == 0) {
      c?.discardActiveObject()
    }

    // TODO this is a weird bugfix
    if (isTouchEvent) {
      setTimeout(() => {
        selectedObjectsRef.value = objects!
      }, 100)
    } else selectedObjectsRef.value = objects!

    selectedObjects = objects
    refresh()
  }

  function getSelectedObjects() {
    return selectedObjects
  }

  function refresh() {
    c?.renderAll()
  }

  function saveState() {
    console.log('saving state')
    undoStack.value.push(prevCanvasState!)
    prevCanvasState = c!.toJSON()
    redoStack.value = []
  }

  function undo() {
    if (undoStack.value.length == 0) return
    const currState = c!.toJSON()
    const previousState = undoStack.value.pop()
    restoreCanvasFromHistory(previousState)
    redoStack.value.push(currState)
  }

  function redo() {
    if (redoStack.value.length == 0) return
    const currState = c!.toJSON()
    const previousState = redoStack.value.pop()
    restoreCanvasFromHistory(previousState)
    undoStack.value.push(currState)
  }

  function restoreCanvasFromHistory(previousState: any) {
    const tmpSelectedObjects = selectedObjects
    disableHistorySaving(c!)
    c!.loadFromJSON(previousState, () => {
      c?.getObjects().forEach(obj => enableObjectIdSaving(obj)) // when we transform a canvas to json, save the object id as well
      refresh()
      prevCanvasState = previousState

      const newSelectedObjects = tmpSelectedObjects
        .map((obj: any) => findObjectById(c!, obj.id)!)
        .filter((obj: any) => !!obj)
      c!.setActiveObject(new fabric.ActiveSelection(newSelectedObjects, { canvas: c }))
      setSelectedObjects(newSelectedObjects)
      enableHistorySaving(c!)
    })
  }

  function setBackgroundColor(color: string) {
    backgroundColor.value = color
  }

  function reset() {
    c?.clear()
    c!.backgroundColor = WHITE
    undoStack.value = []
    redoStack.value = []
  }

  // make a link between our variables and the variables
  watch(brushSize, () => {
    c!.freeDrawingBrush.width = brushSize.value
    // brush.value.width = brushSize.value
  })

  watch(eraserSize, () => {
    c!.freeDrawingBrush.width = eraserSize.value
  })

  watch(healingEraserSize, () => {
    c!.freeDrawingBrush.width = eraserSize.value
  })

  watch(brushColor, () => {
    c!.freeDrawingBrush.color = brushColor.value
  })

  watch(brushType, value => {
    if (value == BrushType.Bucket) return
    resetCanvasMode(c!)
    selectPen(c!)
  })

  return {
    selectedTool,
    selectTool,
    brushSize,
    brushColor,
    isDrawingMode,
    eraserSize,
    lastSelectedEraserTool,
    lastSelectedPenTool,
    stickers,
    textSize,
    textColor,
    textBoxes,
    c,
    send,
    reply,
    jsonToLoad,
    penMenuOpen,
    eraserMenuOpen,
    event,
    brushType,
    healingEraserSize,
    storeCanvas,
    retrieveCanvas,
    setLastSelectedEraser,
    selectAction,
    setSelectedObjects,
    selectedObjects,
    refresh,
    deleteObjects,
    getSelectedObjects,
    selectedObjectsRef,
    saveState,
    undo,
    redo,
    undoStack,
    redoStack,
    selectedObjectStrokeColor,
    selectedObjectFillColor,
    bucketMenuOpen,
    backgroundColor,
    setBackgroundColor,
    getCanvas,
    stickerMenuOpen,
    selectedBackgroundColor
  }
})
