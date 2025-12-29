import { DrawSyncingEvent, DrawSyncingParams } from '@/draw/types/drawSyncing.types'
import * as fabric from 'fabric'
import { FabricObject } from 'fabric'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { applyObjectModification } from '@/draw/helpers/history/object.helper'
import { drawActionMapping } from '@/draw/config/action.config'

// TODO duplicate logic from history... think!
async function syncObjectsAdded(params: DrawSyncingParams<DrawSyncingEvent.added>) {
  const { getCanvas } = useDrawStore()

  const c = getCanvas()

  const objectsToRedo = params.objectJSONS
  if (!objectsToRedo || objectsToRedo.length === 0) return

  const enlivened = await fabric.util.enlivenObjects<FabricObject>(objectsToRedo)

  enlivened.forEach(enlivened => {
    // When insertedIndex is 0, this condition evaluates to false, because 0 is a falsy value in JavaScript.
    if (enlivened.insertedIndex !== undefined && enlivened.insertedIndex !== null) c.insertAt(enlivened.insertedIndex, enlivened) // used for bucket fill
    else c.add(enlivened)
  })
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
  const { getObjectsById, updateVisibility } = useDrawObjectManager()
  const c = getCanvas()
  const objects = getObjectsById(params.objectIds)

  objects.forEach(object => {
    applyObjectModification(c, object, params.transform)
  })


  updateVisibility()
  c.requestRenderAll()
}


export const drawSyncingMapping: {
  [K in DrawSyncingEvent]: (params: DrawSyncingParams<K>) => Promise<void> | void
} = {
  [DrawSyncingEvent.added]: syncObjectsAdded,
  [DrawSyncingEvent.removed]: syncObjectsRemoved,
  [DrawSyncingEvent.modified]: syncObjectsModified
}