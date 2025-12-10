import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { FabricImage } from 'fabric'

export function redoImgFilter(action: HistoryAction<HistoryEvent.ImgFilterChanged>) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectById } = useDrawObjectManager()


  const prevFilter = action.params.prevFilter
  const img = getObjectById(action.params.objectId) as FabricImage

  if (prevFilter) {
    img.filters?.push(prevFilter)
    addToUndoStack({ ...action, params: { ...action.params, prevFilter: null } })
  } else {
    const f = img.filters?.pop()
    addToUndoStack({ ...action, params: { ...action.params, prevFilter: f } })
  }

  img.applyFilters()
  c.requestRenderAll()
}

export function undoImgFilter(action: HistoryAction<HistoryEvent.ImgFilterChanged>) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectById } = useDrawObjectManager()


  const prevFilter = action.params.prevFilter
  const img = getObjectById(action.params.objectId) as FabricImage

  if (prevFilter) {
    img.filters?.push(prevFilter)
    action.params.prevFilter = null
  } else {
    const f = img.filters?.pop()
    action.params.prevFilter = f
  }


  img.applyFilters()
  c.requestRenderAll()
  addToRedoStack({ ...action })

}