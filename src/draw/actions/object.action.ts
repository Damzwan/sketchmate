import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import * as fabric from 'fabric'
import { ActiveSelection, Canvas, FabricObject, Group } from 'fabric'

import {
  DrawAction,
  DrawActionParams,
  DrawTool
} from '@/draw/types/draw.types'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { v4 as uuidv4 } from 'uuid'
import { useSelect } from '@/draw/store/tools/select.store'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { useToast } from '@/service/toast.service'
import { viewSavedButton } from '@/config/toast.config'
import { ToastDuration } from '@/types/toast.types'
import { centerObjectInViewport } from '@/draw/helpers/viewport.helper'
import {
  canvasToBuffer,
  computeBounds,
  exportBoundingBoxImage
} from '@/draw/helpers/export.helper'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { toJSON, toObjectsIds } from '@/draw/helpers/object.helper'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { createSaved } from '@/service/api/user.api'
import {
  enlivenAllBatched,
  enlivenObjectsTimeSlivered,
  generateChunkedJSON,
  migrateLegacyOrigin
} from '@/draw/helpers/drawload.helper'
import { useChatStore } from '@/store/chat.store'
import { createSavedDrawing } from '@/service/api/savedDrawing.api'
import { useShareToastStore } from '@/draw/store/useShareToastStore.store'

export async function removeObjects(objects: FabricObject[]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  if (objects.length === 0) return

  // Record each object's stack position BEFORE removal so undo restores it at
  // its original z instead of on top (insertedIndex is serialized into the
  // history JSON via customProperties, and undoObjectsDeleted re-inserts at
  // it). Captured against the same full stack → ascending re-insert on undo
  // reproduces the layering exactly.
  const stack = c.getObjects()
  for (const obj of objects) {
    (obj as any).insertedIndex = stack.indexOf(obj)
  }

  // Multi-delete: coalesce the N object:removed invalidations into one
  // invalidateRegions pass instead of N destructive sync tile rebuilds.
  const drawObjects = useDrawObjectManager()
  if (objects.length > 1) drawObjects.beginBatch()
  try {
    c.remove(...objects)
  } finally {
    if (objects.length > 1) drawObjects.endBatch()
  }

  c.fire('objectsDeleted', { target: objects })
}

export async function removeSelectedObjects() {
  const { getSelectedObjects, unSelect } = useSelect()
  const selected = getSelectedObjects()

  const { isPublicLobby } = useDrawSyncer()
  if (isPublicLobby) {
    const { user } = useAuthStore()
    if (selected.find((o) => o.userId !== user?._id)) {
      const { toast } = useToast()
      toast('Cannot deleted objects from other user', { color: 'warning' })
      return
    }
  }

  unSelect()
  await removeObjects(selected)
}

// TODO this should be the function that should be used with everything...
export function setPropertiesOfObjects(
  params: DrawActionParams[DrawAction.SetPropertiesOfObject]
) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  params.objects.forEach((obj: any) => {
    obj.set(params.properties)
  })

  c.fire('objects:changed', {
    target: params.objects,
    parameters: params.properties
  })
}

function sortObjectsByLayer(
  objects: FabricObject[],
  c: Canvas,
  reverse = false
) {
  // getObjects() copies the whole stack — never call it inside a comparator.
  const order = new Map(c.getObjects().map((o, i) => [o, i]))
  const sorted = objects.sort(
    (a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)
  )
  return reverse ? sorted.reverse() : sorted
}

export function moveObjectToFront(
  params: DrawActionParams[DrawAction.MoveObjectToFront]
) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const sortedObjects = sortObjectsByLayer(params.objects, c)

  const prevObjectPositions: number[] = []
  const stack = (c as any)._objects as FabricObject[] // live ref, no copy per object

  sortedObjects.forEach((obj: any) => {
    const currI = stack.indexOf(obj)
    prevObjectPositions.push(currI)
    c.bringObjectToFront(obj)
  })

  c.fire('layer:changed', {
    target: params.objects,
    type: DrawAction.MoveObjectToFront,
    prevObjectPositions
  })
}

export function moveObjectToBack(
  params: DrawActionParams[DrawAction.MoveObjectToBack]
) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const sortedObjects = sortObjectsByLayer(params.objects, c, true)

  const prevObjectPositions: number[] = []
  const stack = (c as any)._objects as FabricObject[]

  sortedObjects.forEach((obj: any) => {
    const currI = stack.indexOf(obj)
    prevObjectPositions.push(currI)
    c.sendObjectToBack(obj)
  })

  c.fire('layer:changed', {
    target: params.objects,
    type: DrawAction.MoveObjectToBack,
    prevObjectPositions
  })
}

export function moveObjectUpOneLayer(
  params: DrawActionParams[DrawAction.MoveObjectUpOneLayer]
) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const sortedObjects = sortObjectsByLayer(params.objects, c, true)
  const stack = (c as any)._objects as FabricObject[]
  const objectsLength = stack.length - 1

  sortedObjects.forEach((obj: any) => {
    const currI = stack.indexOf(obj)
    c.moveObjectTo(obj, Math.min(currI + 1, objectsLength))
  })

  c.fire('layer:changed', {
    target: params.objects,
    type: DrawAction.MoveObjectUpOneLayer
  })
}

export function moveObjectDownOneLayer(
  params: DrawActionParams[DrawAction.MoveObjectUpOneLayer]
) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const sortedObjects = sortObjectsByLayer(params.objects, c, false)
  const stack = (c as any)._objects as FabricObject[]

  sortedObjects.forEach((obj: any) => {
    const currI = stack.indexOf(obj)
    c.moveObjectTo(obj, Math.max(currI - 1, 0))
  })

  c.fire('layer:changed', {
    target: params.objects,
    type: DrawAction.MoveObjectDownOneLayer
  })
}

export async function copyObjects(
  params: DrawActionParams[DrawAction.CopyObject]
) {
  const { getCanvas } = useDrawStore()
  const { actionWithoutEvents } = useDrawEventManager()
  const drawObjects = useDrawObjectManager()
  const c = getCanvas()

  if (params.objects.length > 200) {
    const { toast } = useToast()
    toast('Cannot copy more than 200 objects', { color: 'warning' })
    return
  }

  const offsetX = 10, offsetY = 10
  const sources = params.objects
  let clonedObjects: FabricObject[] = []

  await actionWithoutEvents(async () => {
    c.discardActiveObject()


    const serialized = sources.map((o) => o.toObject())
    clonedObjects = await enlivenAllBatched(serialized)

    // Apply offset + ids while the clones are still detached. setCoords is
    // mandatory: the engine bypasses fabric's render loop (which would refresh
    // oCoords), so without it the first control grab on a copy transforms from
    // stale corners — the "shrinks on first scale" glitch.
    clonedObjects.forEach((obj, i) => {
      obj.set({ left: obj.left! + offsetX, top: obj.top! + offsetY })
      obj.id = params.newObjectIds ? params.newObjectIds[i] : uuidv4()
      obj.setCoords()
    })


    drawObjects.beginBatch()
    try {
      c.add(...clonedObjects)
    } finally {
      drawObjects.endBatch()
    }
  })

  const clonedJsons = toJSON(clonedObjects) // history needs this — keep it

  if (!params.newObjectIds) {
    const newActiveObject = clonedObjects.length === 1
      ? clonedObjects[0]
      : new ActiveSelection(clonedObjects, { canvas: c })
    newActiveObject.setCoords()
    c.setActiveObject(newActiveObject)
    c.clearContext(c.getTopContext())
    newActiveObject._renderControls(c.getTopContext())
  }

  c.fire('objectsCopied', {
    target: clonedJsons,
    objectIdsToClone: sources.map((o) => o.id),
    newObjectIds: clonedObjects.map((o) => o.id)
  })
}

export function mergeHelper(
  canvas: Canvas,
  objects: FabricObject[],
  groupId = uuidv4()
): Group {
  const stack = (canvas as any)._objects as FabricObject[]
  const highestIndex = Math.max(...objects.map((obj) => stack.indexOf(obj)))

  const group = new Group(objects, {
    canvas: canvas,
    id: groupId
  } as any)

  objects.forEach((obj) => canvas.remove(obj))

  const targetIndex = Math.max(0, highestIndex - objects.length + 1)
  canvas.insertAt(targetIndex, group)

  return group
}

export async function mergeObjects(params: DrawActionParams[DrawAction.Merge]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const { actionWithoutEvents } = useDrawEventManager()

  let createdGroup: Group | undefined
  await actionWithoutEvents(async () => {
    c.discardActiveObject()
    createdGroup = mergeHelper(c, params.objects)
  })

  if (!createdGroup) return

  c.setActiveObject(createdGroup)
  c.clearContext(c.getTopContext())
  createdGroup._renderControls(c.getTopContext())

  c.fire('objectsMerged', {
    objectIds: [createdGroup.id],
    group: null,
    mergedObjectIds: toObjectsIds(params.objects)
  })
}

export async function flipXObjects(params: DrawActionParams[DrawAction.FlipX]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const objects = params.objects

  if (objects.length === 1) {
    objects[0].set('flipX', !objects[0].flipX)
    objects[0].setCoords()
  } else {
    const tempSelection = new fabric.ActiveSelection(objects, { canvas: c })

    const prevActiveObject = c.getActiveObject()
    c.setActiveObject(tempSelection)

    tempSelection.set('flipX', !tempSelection.flipX)
    tempSelection.setCoords()

    if (!params.setActiveObject) {
      c.discardActiveObject()
      if (prevActiveObject) c.setActiveObject(prevActiveObject)
    }
  }

  c.fire('flip', { direction: 'flipX', target: objects })
}

export async function flipYObjects(params: DrawActionParams[DrawAction.FlipX]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const objects = params.objects

  if (objects.length === 1) {
    objects[0].set('flipY', !objects[0].flipY)
    objects[0].setCoords()
  } else {
    const tempSelection = new fabric.ActiveSelection(objects, { canvas: c })

    const prevActiveObject = c.getActiveObject()
    c.setActiveObject(tempSelection)

    tempSelection.set('flipY', !tempSelection.flipY)
    tempSelection.setCoords()

    if (!params.setActiveObject) {
      c.discardActiveObject()
      if (prevActiveObject) c.setActiveObject(prevActiveObject)
    }
  }

  c.fire('flip', { direction: 'flipY', target: objects })
}

export async function unselectObjects() {
  const { unSelect } = useSelect()
  unSelect()
}

export async function saveFabricObject(
  params: DrawActionParams[DrawAction.SaveFabricObject]
) {
  const { user } = useAuthStore()
  const drawui = useDrawUIStore()
  const shareToastStore = useShareToastStore()
  const { getCanvas } = useDrawStore()

  const c = getCanvas()
  if (!c || !user) return

  drawui.isSavingDrawing = true
  await new Promise((resolve) => setTimeout(resolve, 10))

  try {
    if (params.objects.length > 1) {
      c.discardActiveObject()
    }

    const bounds = computeBounds(params.objects, 0)

    const tempCanvas = new fabric.StaticCanvas(undefined, {
      width: bounds.width,
      height: bounds.height
    })

    const clonedObjects = await Promise.all(
      params.objects.map((obj: fabric.Object) => obj.clone())
    )

    clonedObjects.forEach((obj) => {
      obj.set({
        left: obj.left! - bounds.minX,
        top: obj.top! - bounds.minY,
        userId: user._id
      })
      tempCanvas.add(obj)
    })

    tempCanvas.renderAll()

    // 1. Chunked JSON & Image Generation
    tempCanvas.backgroundColor = 'transparent'
    const jsonObj = await generateChunkedJSON(tempCanvas as any)
    const jsonString = JSON.stringify(jsonObj)

    const exportResult = await exportBoundingBoxImage(tempCanvas as any, {
      maxSize: 1080,
      asBuffer: true,
      quality: 0.9
    })

    if (!exportResult) throw new Error('Export failed')

    // 2. API Call
    const saved = await createSavedDrawing({
      _id: user._id,
      drawing: jsonString,
      img: exportResult.img
    })

    if (params.objects.length > 1) {
      c.setActiveObject(
        new fabric.ActiveSelection(params.objects, { canvas: c })
      )
    }

    shareToastStore.pushSavedToast({ saved })
  } catch (error) {
    console.error('Save failed:', error)
  } finally {
    drawui.isSavingDrawing = false
  }
}

export async function addSavedFabricObjectToCanvas(
  params: DrawActionParams[DrawAction.AddSavedDrawingToCanvas]
) {
  const { user } = useAuthStore() // Access the active user
  const { getCanvas } = useDrawStore()
  const { selectTool, selectedTool } = useToolSelection()
  const { actionWithoutEvents } = useDrawEventManager()
  const drawObjects = useDrawObjectManager()
  const drawui = useDrawUIStore()

  drawui.isLoadingDrawing = true

  const c = getCanvas()
  if (!c) return

  try {
    let jsonData = params.json

    if (typeof params.json === 'string') {
      const response = await fetch(params.json)
      jsonData = await response.json()
    }

    const objects: fabric.Object[] = []

    await enlivenObjectsTimeSlivered(jsonData.objects, (obj) => {
      const migrated = migrateLegacyOrigin(obj)
      migrated.set({
        id: uuidv4(),
        userId: user?._id || migrated.get('userId')
      })
      objects.push(migrated)
    })

    const fitToViewport = (
      obj: fabric.Object,
      canvas: fabric.Canvas,
      padding = 0.8
    ) => {
      const zoom = canvas.getZoom()

      const viewportWidth = canvas.getWidth() / zoom
      const viewportHeight = canvas.getHeight() / zoom

      const objWidth = obj.getScaledWidth()
      const objHeight = obj.getScaledHeight()

      const maxWidth = viewportWidth * padding
      const maxHeight = viewportHeight * padding

      const widthScale = maxWidth / objWidth
      const heightScale = maxHeight / objHeight

      const scale = Math.min(widthScale, heightScale)

      // Only shrink, never enlarge
      if (scale < 1) {
        obj.scale(obj.scaleX! * scale)
      }

      obj.setCoords()
    }

    await actionWithoutEvents(async () => {
      drawObjects.beginBatch()
      try {
        if (objects.length === 1) {
          const obj = objects[0]

          fitToViewport(obj, c)

          centerObjectInViewport(c, obj)
          c.add(obj)

          obj.setCoords()
          c.setActiveObject(obj)
        } else if (objects.length > 1) {
          const selection = new fabric.ActiveSelection(objects, {
            canvas: c
          })

          fitToViewport(selection, c)

          centerObjectInViewport(c, selection)

          selection.forEachObject((obj) => {
            c.add(obj)
            obj.setCoords()
          })

          selection.removeAll()
        }
      } finally {
        drawObjects.endBatch()
      }
    })

    if (selectedTool !== DrawTool.Select) {
      selectTool(DrawTool.Select)
    }

    c.fire('objects:added', {
      target: objects
    })

    if (objects.length === 1) {
      c.setActiveObject(objects[0])
    } else if (objects.length > 1) {
      c.setActiveObject(
        new fabric.ActiveSelection(objects, {
          canvas: c
        })
      )
    }
    drawui.isLoadingDrawing = false
  } catch (error) {
    console.error('Failed to load saved drawing:', error)
  } finally {
  }
}
