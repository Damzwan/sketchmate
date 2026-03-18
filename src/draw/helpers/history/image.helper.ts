import { FabricImage } from 'fabric'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'

export async function redoImgFilter(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.ImgFilterChanged>
): Promise<HistoryAction<HistoryEvent.ImgFilterChanged>> {
  const { canvas, getObjectById } = ctx

  const img = getObjectById(action.params.objectId) as FabricImage
  if (!img) return action

  const prevFilter = action.params.prevFilter

  if (prevFilter) {
    // If we have a filter to restore, push it
    img.filters?.push(prevFilter)
    action.params.prevFilter = null
  } else {
    // Otherwise, we are redoing a "removal" (pop)
    const poppedFilter = img.filters?.pop()
    action.params.prevFilter = poppedFilter || null
  }

  // applyFilters is essential for visual updates in Fabric
  await img.applyFilters()
  canvas.requestRenderAll()

  return action
}

export async function undoImgFilter(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.ImgFilterChanged>
): Promise<HistoryAction<HistoryEvent.ImgFilterChanged>> {
  const { canvas, getObjectById } = ctx

  const img = getObjectById(action.params.objectId) as FabricImage
  if (!img) return action

  const prevFilter = action.params.prevFilter

  if (prevFilter) {
    // If we have a filter to put back, push it
    img.filters?.push(prevFilter)
    action.params.prevFilter = null
  } else {
    // If we are undoing an addition, pop it
    const poppedFilter = img.filters?.pop()
    action.params.prevFilter = poppedFilter || null
  }

  await img.applyFilters()
  canvas.requestRenderAll()

  return action
}