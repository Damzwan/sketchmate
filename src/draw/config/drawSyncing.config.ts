import { DrawSyncingEvent, DrawSyncingParams } from '@/draw/types/drawSyncing.types'
import * as fabric from 'fabric'
import { FabricImage, FabricObject, IText } from 'fabric'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { applyObjectModification } from '@/draw/helpers/history/object.helper'
import { drawActionMapping } from '@/draw/config/action.config'
import { fullErase } from '@/draw/actions/erase.action'
import { DrawAction } from '@/draw/types/draw.types'
import { setCanvasBackground } from '@/draw/actions/color.action'
import { redoActionMapping, undoActionMapping } from '@/draw/config/drawHistory.config'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import { mergeHelper } from '@/draw/actions/object.action'
import { CustomEraserBrush, eraseObject } from '@/draw/utils/brushes/CustomEraserBrush'
import { useDrawUIStore } from '@/draw/store/drawUI.store'

// TODO duplicate logic from history... think!
async function syncObjectsAdded(params: DrawSyncingParams<DrawSyncingEvent.added>) {
  const { getCanvas } = useDrawStore()

  const c = getCanvas()

  const objectsToRedo = params.objectJSONS
  if (!objectsToRedo || objectsToRedo.length === 0) return

  const enlivened = await fabric.util.enlivenObjects<FabricObject>(objectsToRedo)

  enlivened.forEach((enlivened, index) => {
    if (enlivened.insertedIndex !== undefined && enlivened.insertedIndex !== null) c.insertAt(enlivened.insertedIndex, enlivened) // used for bucket fill
    else c.add(enlivened)
  })

  if (params.creator && enlivened.length > 0) {
    const {showOrUpdateAvatar} = useDrawUIStore()
    const firstObj = enlivened[0]
    showOrUpdateAvatar(params.creator, firstObj.left || 0, firstObj.top || 0)
  }

  c.requestRenderAll()
}

async function syncObjectsRemoved(params: DrawSyncingParams<DrawSyncingEvent.removed>) {
  const { getCanvas } = useDrawStore()
  const { getObjectsById } = useDrawObjectManager()
  const c = getCanvas()
  const objects = getObjectsById(params.objectIds)

  c.remove(...objects)
  c.requestRenderAll()
}

async function syncObjectsModified(params: DrawSyncingParams<DrawSyncingEvent.modified>) {
  const { getCanvas } = useDrawStore()
  const { getObjectById, updateVisibility } = useDrawObjectManager()
  const { createHistoryContext } = useDrawHistoryManager()


  params.changes.forEach(({ id, backward }) => {
    const obj = getObjectById(id)
    if (!obj) return
    applyObjectModification(createHistoryContext(), obj, backward)
  })

  updateVisibility()
  getCanvas().requestRenderAll()
}

async function syncFullErase() {
  fullErase() // TODO select
}

// TODO duplicates...
async function syncMoveObjectToFront(params: DrawSyncingParams<DrawSyncingEvent.MoveObjectToFront>) {
  const { getObjectsById } = useDrawObjectManager()
  const objects = getObjectsById(params.objectIds)
  await drawActionMapping[DrawAction.MoveObjectToFront]({ objects: objects })
}

async function syncMoveObjectToBack(params: DrawSyncingParams<DrawSyncingEvent.MoveObjectToFront>) {
  const { getObjectsById } = useDrawObjectManager()
  const objects = getObjectsById(params.objectIds)
  await drawActionMapping[DrawAction.MoveObjectToBack]({ objects: objects })
}


async function syncMoveObjectDownOneLayer(params: DrawSyncingParams<DrawSyncingEvent.MoveObjectToFront>) {
  const { getObjectsById } = useDrawObjectManager()
  const objects = getObjectsById(params.objectIds)
  await drawActionMapping[DrawAction.MoveObjectDownOneLayer]({ objects: objects })
}

async function syncMoveObjectUpOneLayer(params: DrawSyncingParams<DrawSyncingEvent.MoveObjectToFront>) {
  const { getObjectsById } = useDrawObjectManager()
  const objects = getObjectsById(params.objectIds)
  await drawActionMapping[DrawAction.MoveObjectUpOneLayer]({ objects: objects })
}

async function syncFlipX(params: DrawSyncingParams<DrawSyncingEvent.FlipX>) {
  const { getObjectsById } = useDrawObjectManager()
  const objects = getObjectsById(params.objectIds)
  await drawActionMapping[DrawAction.FlipX]({ objects: objects })
}

async function syncFlipY(params: DrawSyncingParams<DrawSyncingEvent.FlipY>) {
  const { getObjectsById } = useDrawObjectManager()
  const objects = getObjectsById(params.objectIds)
  await drawActionMapping[DrawAction.FlipY]({ objects: objects })
}

async function syncObjectsCopied(params: DrawSyncingParams<DrawSyncingEvent.ObjectsCopied>) {
  const { getObjectsById } = useDrawObjectManager()
  const objects = getObjectsById(params.objectIds)
  await drawActionMapping[DrawAction.CopyObject]({ objects: objects, newObjectIds: params.newObjectIds })
}

async function syncBackgroundColorChanged(params: DrawSyncingParams<DrawSyncingEvent.BackgroundColorChanged>) {
  await setCanvasBackground({ color: params.color })
}

// TODO copy from history
async function syncTextStyleChanged(params: DrawSyncingParams<DrawSyncingEvent.TextStyleChanged>) {
  const { getObjectById } = useDrawObjectManager()
  const textObject = getObjectById(params.objectId) as any

  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const prevStyle: any = {}

  Object.entries(params.style).forEach(([key, value]) => {
    prevStyle[key] = textObject[key]
    textObject.set(key, value)
  })

  c.requestRenderAll()
}


async function syncObjectStyleChanged(params: DrawSyncingParams<DrawSyncingEvent.ObjectStyleChanged>) {
  const { getObjectsById } = useDrawObjectManager()

  const canvasObjects = getObjectsById(params.objectIds)

  canvasObjects.forEach((canvasObject) => {
    canvasObject.set(params.style)
  })
}

async function syncImgFilterChanged(params: DrawSyncingParams<DrawSyncingEvent.ImgFilterChanged>) {
  const { getObjectById } = useDrawObjectManager()
  const img = getObjectById(params.objectId) as FabricImage

  if (!params.filter) {
    img.filters?.pop()
  } else {
    const [filter] = await fabric.util.enlivenObjects<any>([params.filter]) // TODO typing
    if (filter.type == 'BlendColor') img.filters = img.filters?.filter((f: any) => f.type != 'BlendColor')
    img.filters?.push(filter)
  }

  img.applyFilters()
}

async function syncUndo(params: DrawSyncingParams<DrawSyncingEvent.Undo>) {
  const { createHistoryContext } = useDrawHistoryManager()
  await undoActionMapping[params.type](createHistoryContext(), params as any)
}

async function syncRedo(params: DrawSyncingParams<DrawSyncingEvent.Undo>) {
  const { createHistoryContext } = useDrawHistoryManager()
  await redoActionMapping[params.type](createHistoryContext(), params as any)
}


async function syncObjectsMerged(params: DrawSyncingParams<DrawSyncingEvent.ObjectsMerged>) {
  const { getObjectsById } = useDrawObjectManager()
  const objects = getObjectsById(params.mergedObjectIds)
  const { getCanvas } = useDrawStore()
  mergeHelper(getCanvas(), objects, params.groupId)
}

async function syncErasingEnd(params: DrawSyncingParams<DrawSyncingEvent.ErasingEnd>) {
  const { getObjectsById } = useDrawObjectManager()
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const enlivenedPath = await fabric.util.enlivenObjects<fabric.Path>([params.erasePath])
  const newStroke = enlivenedPath[0]

  const objects = getObjectsById(params.objectIds)
  const deletedObjects = getObjectsById(params.deletedObjectIds || [])

  await Promise.all(objects.map(async (o) => {
    if (o) await eraseObject(o, newStroke)
  }))

  if (deletedObjects.length > 0) {
    c.remove(...deletedObjects)
  }

  c.requestRenderAll()
}

async function syncTextChanged(params: DrawSyncingParams<DrawSyncingEvent.TextChanged>) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const { getObjectsById } = useDrawObjectManager()
  const objects = getObjectsById([params.objectId])
  const text = objects[0] as IText
  text.set('text', params.newText)
  c.requestRenderAll()
}


export const drawSyncingMapping: {
  [K in DrawSyncingEvent]: (params: DrawSyncingParams<K>) => Promise<void> | void
} = {
  [DrawSyncingEvent.added]: syncObjectsAdded,
  [DrawSyncingEvent.removed]: syncObjectsRemoved,
  [DrawSyncingEvent.modified]: syncObjectsModified,
  [DrawSyncingEvent.fullErase]: syncFullErase,
  [DrawSyncingEvent.MoveObjectToFront]: syncMoveObjectToFront,
  [DrawSyncingEvent.MoveObjectToBack]: syncMoveObjectToBack,
  [DrawSyncingEvent.MoveObjectDownOneLayer]: syncMoveObjectDownOneLayer,
  [DrawSyncingEvent.MoveObjectUpOneLayer]: syncMoveObjectUpOneLayer,
  [DrawSyncingEvent.FlipX]: syncFlipX,
  [DrawSyncingEvent.FlipY]: syncFlipY,
  [DrawSyncingEvent.ObjectsCopied]: syncObjectsCopied,
  [DrawSyncingEvent.BackgroundColorChanged]: syncBackgroundColorChanged,
  [DrawSyncingEvent.TextStyleChanged]: syncTextStyleChanged,
  [DrawSyncingEvent.ObjectStyleChanged]: syncObjectStyleChanged,
  [DrawSyncingEvent.ImgFilterChanged]: syncImgFilterChanged,
  [DrawSyncingEvent.Undo]: syncUndo,
  [DrawSyncingEvent.Redo]: syncRedo,
  [DrawSyncingEvent.ObjectsMerged]: syncObjectsMerged,
  [DrawSyncingEvent.ErasingEnd]: syncErasingEnd,
  [DrawSyncingEvent.TextChanged]: syncTextChanged
}