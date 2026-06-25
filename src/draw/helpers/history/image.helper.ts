import { FabricImage } from 'fabric'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'
import * as fabric from 'fabric'

export async function redoImgFilter(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.ImgFilterChanged>
): Promise<HistoryAction<HistoryEvent.ImgFilterChanged>> {
  const { canvas, getObjectById } = ctx
  const img = getObjectById(action.params.objectId) as FabricImage

  if (!img) return action

  let updatedPrevFilter = action.params.prevFilter

  if (action.params.prevFilter) {
    if (action.params.prevFilter.type == 'BlendColor') img.filters = img.filters?.filter((f: any) => f.type != 'BlendColor')
    const [filterAlive] =  await fabric.util.enlivenObjects<any>([action.params.prevFilter]) // TODO mismatch between undo/redo sync (json instaed of object) and normal
    img.filters?.push(filterAlive)
    updatedPrevFilter = null
  } else {
    // Redo a removal (pop)
    const poppedFilter = img.filters?.pop()
    updatedPrevFilter = poppedFilter || null
  }

  await img.applyFilters()

  // Return a new object with updated params
  return {
    ...action,
    params: {
      ...action.params,
      prevFilter: updatedPrevFilter
    }
  }
}

export async function undoImgFilter(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.ImgFilterChanged>
): Promise<HistoryAction<HistoryEvent.ImgFilterChanged>> {
  const { canvas, getObjectById } = ctx
  const img = getObjectById(action.params.objectId) as FabricImage

  if (!img) return action

  const { prevFilter, prevBlendColorFilter } = action.params
  let nextPrevFilter = prevFilter

  if (prevFilter) {
    // Restore previous filter
    img.filters?.push(prevFilter)
    nextPrevFilter = null
  } else {
    // Undo an addition (pop)
    const poppedFilter = img.filters?.pop()

    if (prevBlendColorFilter) {
      const [prevBlendColorFilterAlive] = await fabric.util.enlivenObjects<any>([prevBlendColorFilter]) // TODO mismatch between undo/redo sync (json instaed of object) and normal
      img.filters.push(prevBlendColorFilterAlive)
    }
    nextPrevFilter = poppedFilter || null
  }

  await img.applyFilters()

  // Return a new object with updated params
  return {
    ...action,
    params: {
      ...action.params,
      prevFilter: nextPrevFilter
    }
  }
}