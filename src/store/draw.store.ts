import { defineStore, storeToRefs } from 'pinia'
import { BrushType, DrawAction, DrawTool, Eraser, EraserSize, Pen, ShapeCreationMode } from '@/types/draw.types'
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
} from '@/helper/draw/draw.helper'
import { fabric } from 'fabric'
import { EventBus } from '@/main'
import { useAPI } from '@/service/api.service'
import { useToast } from '@/service/toast.service'
import { viewSavedButton } from '@/config/toast.config'
import Hammer from 'hammerjs'

export const useDrawStore = defineStore('draw', () => {
  const { user, isLoading } = storeToRefs(useAppStore())
  const { toast } = useToast()
  const api = useSocketService()
  const { createSaved, deleteSaved } = useAPI()
  const router = useRouter()

  const shapeCreationMode = ref<ShapeCreationMode>()

  const backgroundColor = ref(WHITE)
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
  const selectedObjectsRef = ref<Array<fabric.Object | fabric.Group>>([])

  const jsonToLoad = ref<JSON>()
  let c: Canvas | undefined // needs to be a global variable
  const event = ref<Event>() // used by ion-popover to position itself

  const penMenuOpen = ref(false)
  const eraserMenuOpen = ref(false)
  const bucketMenuOpen = ref(false)
  const stickerMenuOpen = ref(false)
  const savedMenuOpen = ref(false)
  const shapesMenuOpen = ref(false)
  const shapesMenuEvent = ref<any>()

  const loadingText = ref('')

  const openMenuMapping: { [key in DrawTool]: (() => void) | undefined } = {
    [DrawTool.Pen]: () => (penMenuOpen.value = true),
    [DrawTool.MobileEraser]: () => (eraserMenuOpen.value = true),
    [DrawTool.HealingEraser]: () => (eraserMenuOpen.value = true),
    [DrawTool.Select]: undefined
  }

  const selectedObjectStrokeColor = ref(BLACK)
  const selectedObjectFillColor = ref(BLACK)
  const selectedBackgroundColor = ref(BLACK)

  let prevCanvasState: any
  const undoStack = ref<any[]>([])
  const redoStack = ref<any[]>([])

  const hammer = ref<HammerManager>()
  const canZoomOut = ref(false)

  // We make use of events so we do not load the big draw.store in other views
  EventBus.on('reset-canvas', reset)

  function selectTool(newTool: DrawTool, e: Event | undefined = undefined, openMenu = true) {
    event.value = e
    if (newTool != selectedTool.value) {
      selectedTool.value = newTool
    } else if (openMenu) {
      const openMenu = openMenuMapping[newTool]
      if (openMenu) openMenu()
    }
    resetCanvasMode(c!)
    selectToolMapping[newTool](c!)
  }

  function selectAction(action: DrawAction, options?: object) {
    actionMapping[action](c!, options)
  }

  function storeCanvas(canvas: Canvas) {
    c = canvas
    prevCanvasState = c.toJSON()
    initGestures()
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
    loadingText.value = 'Sending drawing...'
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

  function setSelectedObjects(objects: Array<fabric.Object | fabric.Group> | undefined, isTouchEvent = false) {
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
      selectedObjects.forEach(obj => obj.set({ perPixelTargetFind: true }))
      c?.discardActiveObject()
    }

    objects.forEach(obj => obj.set({ perPixelTargetFind: false }))

    // TODO this is a weird bugfix
    if (isTouchEvent) {
      setTimeout(() => {
        selectedObjectsRef.value = objects!
      }, 100)
    } else selectedObjectsRef.value = objects

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

  async function addSaved(objects: fabric.Object[]) {
    isLoading.value = true
    loadingText.value = 'Saving drawing...'

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    // Calculate the bounding box for the objects
    objects.forEach(obj => {
      const boundingRect = obj.getBoundingRect(true) // Pass true to get a box that surrounds the entire object even if it's rotated
      minX = Math.min(minX, boundingRect.left)
      minY = Math.min(minY, boundingRect.top)
      maxX = Math.max(maxX, boundingRect.left + boundingRect.width)
      maxY = Math.max(maxY, boundingRect.top + boundingRect.height)
    })

    const width = maxX - minX
    const height = maxY - minY

    const tempCanvas = new fabric.StaticCanvas(null, { width: width, height: height })

    const clonedObjects = await Promise.all(
      objects.map(
        obj =>
          new Promise<fabric.Object>(resolve => {
            obj.clone((cloned: fabric.Object) => resolve(cloned))
          })
      )
    )

    // Add objects to the canvas
    clonedObjects.forEach(obj => {
      // Clone the object
      obj.set({
        left: obj.left! - minX,
        top: obj.top! - minY
      })
      tempCanvas.add(obj)
    })

    tempCanvas.renderAll()

    // Save canvas as JSON and DataURL
    const json = JSON.stringify(tempCanvas.toJSON())
    const dataUrl = tempCanvas.toDataURL()

    const saved = await createSaved({ _id: user.value!._id, drawing: json, img: dataUrl })
    user.value?.saved.push(saved!)
    isLoading.value = false
    toast('Saved drawing', { buttons: [viewSavedButton] })
  }

  function setSavedMenuOpen(open: boolean) {
    savedMenuOpen.value = open
  }

  function setShapeCreationMode(mode: ShapeCreationMode) {
    shapeCreationMode.value = mode
  }

  function setShapesMenuOpen(open: boolean, event: any) {
    shapesMenuOpen.value = open
    shapesMenuEvent.value = event
  }

  function initGestures() {
    const upperCanvasEl = (c! as any).upperCanvasEl
    hammer.value = new Hammer.Manager(upperCanvasEl)
    hammer.value.add(new Hammer.Pinch())
  }

  function setCanZoomOut(bool: boolean) {
    canZoomOut.value = bool
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
    selectedBackgroundColor,
    addSaved,
    loadingText,
    savedMenuOpen,
    setSavedMenuOpen,
    shapeCreationMode,
    setShapeCreationMode,
    shapesMenuOpen,
    shapesMenuEvent,
    setShapesMenuOpen,
    hammer,
    canZoomOut,
    setCanZoomOut
  }
})
