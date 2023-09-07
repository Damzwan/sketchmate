import { ref } from 'vue'
import {
  enlivenObjects,
  getStaticObjWithAbsolutePosition,
  isText,
  objectsFromTarget,
  restoreSelectedObjects
} from '@/helper/draw/draw.helper'
import { Canvas, IText } from 'fabric/fabric-impl'
import { defineStore } from 'pinia'
import { useSelect } from '@/service/draw/tools/select.tool'
import { DrawAction, DrawEvent, FabricEvent, ObjectType } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'
import { fabric } from 'fabric'
import { EventBus } from '@/main'
import { useDrawStore } from '@/store/draw/draw.store'
import { undoColoring } from '@/helper/draw/actions/color.action'
import { applyCurve, deleteCurve } from '@/helper/draw/actions/text.action'

type HistoryEvent =
  | 'erasing:end'
  | 'after:transform'
  | 'object:removed'
  | 'object:added'
  | 'object:modified'
  | 'layering'
  | 'merge'
  | 'backgroundImg'
  | 'fullErase'
  | 'polygon'
  | 'canvasBackground'
  | 'imgFilter'

interface HistoryAction {
  type: HistoryEvent
  objects: fabric.Object[]
  options?: any
}

export const useHistory = defineStore('history', () => {
  let c: Canvas | undefined = undefined
  let prevCanvasObjects: any[] | undefined = []

  let undoStack: HistoryAction[] = []
  let redoStack: HistoryAction[] = []
  const undoStackCounter = ref(0)
  const redoStackCounter = ref(0)

  let modifyingObject: any = undefined

  const { subscribe, unsubscribe, actionWithoutEvents } = useEventManager()
  const { getSelectedObjects } = useSelect()

  const undoMapping: Partial<Record<HistoryEvent, (objects: fabric.Object[], options?: any) => void>> = {
    'object:added': undoObjectAdded,
    'object:modified': undoObjectModified,
    'object:removed': undoObjectDeleted,
    layering: undoLayering,
    merge: undoMerge,
    backgroundImg: undoBackgroundImg,
    fullErase: undoFullErase,
    polygon: undoPolyPointAdded,
    canvasBackground: undoSetCanvasBackground,
    imgFilter: undoImgFilter
  }

  const redoMapping: Partial<Record<HistoryEvent, (objects: fabric.Object[], options?: any) => void>> = {
    'object:added': redoObjectAdded,
    'object:modified': redoObjectModified,
    'object:removed': redoObjectDeleted,
    layering: redoLayering,
    merge: redoMerge,
    backgroundImg: redoBackgroundImg,
    fullErase: redoFullErase,
    polygon: redoPolyPointAdded,
    canvasBackground: redoSetCanvasBackground,
    imgFilter: redoImgFilter
  }

  const events: FabricEvent[] = [
    {
      type: DrawEvent.SaveHistory,
      on: 'erasing:end',
      handler: (e: any) => {
        if (e.targets.length == 0) return
        let modifiedObjects = e.targets as fabric.Object[]
        modifiedObjects = modifiedObjects.map(obj => prevCanvasObjects?.find(o => o.id == obj.id))
        addToUndoStack(modifiedObjects, 'object:modified')
      }
    },
    {
      type: DrawEvent.SaveHistory,
      on: 'after:transform',
      handler: onModified
    },
    {
      type: DrawEvent.SaveHistory,
      on: 'object:added',
      handler: (e: any) => {
        c?.requestRenderAll()
        addToUndoStack(objectsFromTarget(e.target), 'object:added')
      }
    },
    {
      type: DrawEvent.SaveHistory,
      on: 'object:moving',
      handler: (options: any) => {
        if (!modifyingObject) modifyingObject = options.target.toObject()
      }
    },
    {
      type: DrawEvent.SaveHistory,
      on: 'object:modified',
      handler: onModified
    }
  ]

  function onModified(e: any) {
    const target = e.target
    const threshold = 0.5

    if (modifyingObject) {
      const modifyingObjectLeft = modifyingObject.left
      const modifyingObjectTop = modifyingObject.top
      modifyingObject = undefined

      if (
        Math.abs(target.left - modifyingObjectLeft) <= threshold &&
        Math.abs(target.top - modifyingObjectTop) <= threshold
      ) {
        return
      }
    }

    const modifiedObjects = objectsFromTarget(e.target)
    if (isText(modifiedObjects) && (modifiedObjects[0] as IText).init) {
      const text = modifiedObjects[0] as IText
      text.init = false
      addToUndoStack(modifiedObjects, 'object:added')
    } else {
      addPrevModifiedObjectsToStack(modifiedObjects)
    }
  }

  function addPrevModifiedObjectsToStack(modifiedObjects: fabric.Object[]) {
    const prevModifiedObjects = modifiedObjects.map(obj => prevCanvasObjects?.find(o => o.id == obj.id))
    addToUndoStack(prevModifiedObjects, 'object:modified')
  }

  function undoObjectAdded(objects: fabric.Object[]) {
    objects.forEach(obj => {
      const currObj = c?.getObjects().find(o => o.id == obj.id)
      if (!currObj) return
      c?.remove(currObj)
    })
    redoStack.push({ type: 'object:added', objects: objects.map(o => getStaticObjWithAbsolutePosition(o)) })
    restoreSelectedObjects(c!, getSelectedObjects())
  }

  function undoImgFilter(objects: fabric.Object[], options: any) {
    const img = objects[0] as fabric.Image

    const foundImg = c?.getObjects().find(o => o.id == img.id) as fabric.Image
    if (!foundImg) return

    if (options && options['filter']) {
      foundImg.filters?.push(options['filter'])
      redoStack.push({ type: 'imgFilter', objects })
    } else {
      redoStack.push({ type: 'imgFilter', objects, options: { filter: foundImg.filters?.pop() } })
    }

    foundImg.applyFilters()
    c?.requestRenderAll()
  }

  function redoImgFilter(objects: fabric.Object[], options: any) {
    const img = objects[0] as fabric.Image

    const foundImg = c?.getObjects().find(o => o.id == img.id) as fabric.Image
    if (!foundImg) return

    if (options && options['filter']) {
      foundImg.filters?.push(options['filter'])
      undoStack.push({ type: 'imgFilter', objects })
    } else {
      undoStack.push({ type: 'imgFilter', objects, options: { filter: foundImg.filters?.pop() } })
    }

    foundImg.applyFilters()
    c?.requestRenderAll()
  }

  async function undoObjectModified(objects: fabric.Object[], options: any) {
    c?.discardActiveObject()
    const modifiedObjects: fabric.Object[] = []
    for (const obj of objects) {
      const currObj = c?.getObjects().find(o => o.id == obj.id)
      if (!currObj) continue
      modifiedObjects.push(currObj.toObject())
      const enlivenedObj: any = (await enlivenObjects([obj]))[0]

      if (!options)
        currObj.set({
          left: obj.left!,
          top: obj.top!,
          angle: obj.angle!,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          eraser: enlivenedObj.eraser
        })

      if (options && options.flip) {
        currObj.set({
          flipX: obj.flipX,
          flipY: obj.flipY
        })
      }
      if (options && options.color) {
        await undoColoring(currObj, enlivenedObj)
      }
      if (currObj.type == ObjectType.text) (currObj as IText).set({ text: (enlivenedObj as IText).text })
      if (currObj.type == ObjectType.text && options && options.textStyle) {
        const o = currObj as IText
        o.set({
          fontFamily: (enlivenedObj as IText).fontFamily,
          fontWeight: (enlivenedObj as IText).fontWeight,
          fontStyle: (enlivenedObj as IText).fontStyle,
          textAlign: (enlivenedObj as IText).textAlign,
          isCurved: (enlivenedObj as IText).isCurved
        })

        // TODO curve logic should be in the object logic itself imo
        if (o && o.isCurved) applyCurve(o, c!)
        else deleteCurve(o)
      }

      if (options && options.polyCreate) {
        const o = currObj as any
        o.set({ points: (obj as any).points })
        o._setPositionDimensions({})
      }
      currObj.setCoords()
      currObj.dirty = true
      c?.requestRenderAll()
    }

    redoStack.push({ type: 'object:modified', objects: modifiedObjects, options })
    restoreSelectedObjects(c!, getSelectedObjects())
    c?.renderAll()
  }

  function undoObjectDeleted(objects: fabric.Object[]) {
    c?.add(...objects)
    redoStack.push({ type: 'object:removed', objects: objects })
    c?.requestRenderAll()
  }

  function undoLayering(objects: fabric.Object[]) {
    redoStack.push({ type: 'layering', objects: c!.getObjects() })
    for (let i = 0; i < objects.length; i++) {
      const currObj = c?.getObjects().find(o => o.id == objects[i].id)
      if (!currObj) continue
      c?.moveTo(currObj, i)
    }
    c?.renderAll()
  }

  function undoMerge(objects: any) {
    const g = objects[0] as fabric.Group
    const group: any = c?.getObjects().find(o => o.id == g.id)

    c?.remove(group)

    group._restoreObjectsState()

    c?.add(...group._objects)
    group._objects.forEach((obj: any) => {
      obj.setCoords() // Refresh coordinates of the object
    })

    // c?.setActiveObject(new fabric.ActiveSelection(group._objects, { canvas: c }))

    c?.renderAll() // Refresh the canvas

    redoStack.push({
      type: 'merge',
      objects: group._objects,
      options: { id: group.id }
    })
  }

  function undoBackgroundImg(objects: any[]) {
    const previousBackgroundImage = objects[0] as fabric.Image | undefined
    redoStack.push({ type: 'backgroundImg', objects: [c?.backgroundImage as any] })
    c!.backgroundImage = previousBackgroundImage
    c?.requestRenderAll()
  }

  function undoFullErase(objects: any[]) {
    const prevCanvasJSON = objects[0]
    c?.loadFromJSON(prevCanvasJSON, () => {
      console.log('undo clear')
    })
    redoStack.push({ type: 'fullErase', objects: [] })
  }

  function undoPolyPointAdded(objects: any[]) {
    const shape: any = objects[0]
    redoStack.push({ type: 'polygon', objects: [shape.toObject()] })
    const currObj: any = c?.getObjects().find(o => o.id == shape.id)
    if (!currObj) return

    if (currObj.edit) {
      const { setSelectedObjects } = useSelect()
      c?.discardActiveObject()
      setSelectedObjects([])
    }
    const points = currObj.points
    points.pop()

    if (points.length == 0) {
      restoreSelectedObjects(c!, []) // TODO kinda hacky
      c?.remove(currObj)
      return
    }

    // Calculate new width and height based on points
    currObj.set({ points })
    currObj._setPositionDimensions({})
    currObj.dirty = true

    c?.requestRenderAll()
  }

  async function redoPolyPointAdded(objects: any[]) {
    const enlivenedObject = (await enlivenObjects(objects))[0]
    undoStack.push({ type: 'polygon', objects: [enlivenedObject] })
    const shape: any = objects[0]
    const currObj: any = c?.getObjects().find(o => o.id == shape.id)
    if (!currObj) {
      c?.add(enlivenedObject)
      return
    }

    const points = shape.points

    currObj.set({ points })
    currObj._setPositionDimensions({})
    currObj.dirty = true
    c?.requestRenderAll()
  }

  function undoSetCanvasBackground(objects: fabric.Object[], options?: any) {
    const prevColor = options['prevColor']
    redoStack.push({ type: 'canvasBackground', objects: [], options: { prevColor: c!.backgroundColor } })
    c!.setBackgroundColor(prevColor, () => undefined)
    c!.requestRenderAll()
  }

  function redoSetCanvasBackground(objects: fabric.Object[], options?: any) {
    const prevColor = options['prevColor']
    undoStack.push({ type: 'canvasBackground', objects: [], options: { prevColor: c!.backgroundColor } })
    c!.setBackgroundColor(prevColor, () => undefined)
    c!.requestRenderAll()
  }

  async function redoObjectModified(objects: fabric.Object[], options?: any) {
    c?.discardActiveObject()
    const modifiedObjects: fabric.Object[] = []
    for (const obj of objects) {
      const currObj = c?.getObjects().find(o => o.id == obj.id)
      if (!currObj) continue
      modifiedObjects.push(currObj.toObject())
      const enlivenedObj: any = (await enlivenObjects([obj]))[0]

      if (!options)
        currObj.set({
          left: obj.left!,
          top: obj.top!,
          angle: obj.angle!,
          scaleX: obj.scaleX,
          scaleY: obj.scaleY,
          eraser: enlivenedObj.eraser
        })
      if (options && options.flip) {
        currObj.set({
          flipX: obj.flipX,
          flipY: obj.flipY
        })
      }

      if (options && options.color) {
        await undoColoring(currObj, enlivenedObj)
      }
      if (currObj.type == ObjectType.text) (currObj as IText).set({ text: (enlivenedObj as IText).text })
      if (currObj.type == ObjectType.text && options && options.textStyle) {
        const o = currObj as IText
        o.set({
          fontFamily: (enlivenedObj as IText).fontFamily,
          fontWeight: (enlivenedObj as IText).fontWeight,
          fontStyle: (enlivenedObj as IText).fontStyle,
          textAlign: (enlivenedObj as IText).textAlign,
          isCurved: (enlivenedObj as IText).isCurved
        })

        // TODO curve logic should be in the object logic itself imo
        if (o && o.isCurved) applyCurve(o, c!)
        else deleteCurve(o)
      }
      if (options && options.polyCreate) {
        const o = currObj as any
        o.set({ points: (obj as any).points })
        o._setPositionDimensions({})
      }
      currObj.setCoords()
      currObj.dirty = true
    }

    undoStack.push({ type: 'object:modified', objects: modifiedObjects, options })
    const { getSelectedObjects } = useSelect()
    restoreSelectedObjects(c!, getSelectedObjects())
    c?.requestRenderAll()
  }

  async function redoObjectAdded(objects: fabric.Object[]) {
    objects = await enlivenObjects(objects)

    if (isText(objects) && (objects[0] as IText).isCurved) applyCurve(objects[0] as IText, c!)

    c?.add(...objects)
    undoStack.push({ type: 'object:added', objects: objects })
    restoreSelectedObjects(c!, getSelectedObjects())
    c?.requestRenderAll()
  }

  function redoObjectDeleted(objects: fabric.Object[]) {
    c?.remove(...objects)
    undoStack.push({ type: 'object:removed', objects: objects })
    c?.requestRenderAll()
  }

  function redoLayering(objects: fabric.Object[]) {
    undoStack.push({ type: 'layering', objects: c!.getObjects() })
    for (let i = 0; i < objects.length; i++) {
      const currObj = c?.getObjects().find(o => o.id == objects[i].id)
      if (!currObj) continue
      c?.moveTo(currObj, i)
    }
    c?.renderAll()
  }

  async function redoMerge(objects: fabric.Object[], options?: any) {
    const { selectAction } = useDrawStore()
    const { setSelectedObjects } = useSelect()
    c?.discardActiveObject()

    objects = objects.map(o => c?.getObjects().find(o2 => o2.id == o.id)) as any[]

    await selectAction(DrawAction.Merge, { objects: objects, noReset: true })
    const lastObject: any = c?.getObjects()[c?.getObjects().length - 1]
    lastObject.id = options['id']

    c?.discardActiveObject()
    setSelectedObjects([])

    c?.requestRenderAll()
  }

  function redoBackgroundImg(objects: any[]) {
    const previousBackgroundImage = objects[0] as fabric.Image | undefined
    undoStack.push({ type: 'backgroundImg', objects: [c?.backgroundImage as any] })
    c!.backgroundImage = previousBackgroundImage
    c?.renderAll()
  }

  function redoFullErase() {
    const { selectAction } = useDrawStore()
    const { setSelectedObjects } = useSelect()

    c?.discardActiveObject()
    setSelectedObjects([])

    selectAction(DrawAction.FullErase, { noReset: true })
  }

  function init(canvas: Canvas) {
    c = canvas
    enableEvents()
    prevCanvasObjects = c?.getObjects().map(obj => getStaticObjWithAbsolutePosition(obj))
  }

  function destroy(maintainHistory: boolean) {
    disableEvents()
    c = undefined
    prevCanvasObjects = []
    if (!maintainHistory) clearHistory()
  }

  function enableEvents() {
    events.forEach(e => subscribe(e))
  }

  function disableEvents() {
    events.forEach(e => unsubscribe(e))
  }

  async function actionWithoutHistory(action: () => void) {
    disableEvents()
    await action()
    enableEvents()
  }

  async function undo() {
    await actionWithoutEvents(async () => {
      const action = undoStack.pop()
      if (!action) return
      await undoMapping[action.type]!(action.objects, action.options)
      prevCanvasObjects = c?.getObjects().map(obj => getStaticObjWithAbsolutePosition(obj))
      resetStackCounters()
    })
    EventBus.emit('undo')
  }

  function resetStackCounters() {
    undoStackCounter.value = undoStack.length
    redoStackCounter.value = redoStack.length
  }

  async function redo() {
    await actionWithoutEvents(async () => {
      const action = redoStack.pop()
      if (!action) return
      await redoMapping[action.type]!(action.objects, action.options)
      prevCanvasObjects = c?.getObjects().map(obj => getStaticObjWithAbsolutePosition(obj))
      resetStackCounters()
    })
    EventBus.emit('redo')
  }

  function clearHistory() {
    undoStack = []
    redoStack = []
    prevCanvasObjects = []
    resetStackCounters()
  }

  function addToUndoStack(objects: fabric.Object[], historyEvent: HistoryEvent, options?: any) {
    console.log(`${historyEvent}`)
    undoStack.push({ objects, type: historyEvent, options })
    if (!options || (options && !options['noReset'])) redoStack = []
    resetStackCounters()
    prevCanvasObjects = c?.getObjects().map(obj => getStaticObjWithAbsolutePosition(obj))

    // hack since the way addToUndoStack is implemented is that it can be called before the change
    setTimeout(() => EventBus.emit('add_to_undo_stack'), 200)
  }

  return {
    init,
    undo,
    redo,
    disableHistorySaving: disableEvents,
    enableHistorySaving: enableEvents,
    actionWithoutHistory,
    clearHistory,
    destroy,
    undoStackCounter,
    redoStackCounter,
    addToUndoStack,
    addPrevModifiedObjectsToStack
  }
})
