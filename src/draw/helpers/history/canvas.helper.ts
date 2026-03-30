import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'
import { fullErase } from '@/draw/actions/erase.action'

export async function redoChangeBackgroundColor(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.BackgroundColorChanged>
): Promise<HistoryAction<HistoryEvent.BackgroundColorChanged>> {
  const { canvas } = ctx

  // Swap current color with the one in history
  const currentColor = canvas.backgroundColor as string
  canvas.backgroundColor = action.params.previousColor

  canvas.requestRenderAll()

  return { ...action, params: { previousColor: currentColor } }

}

export async function redoFullErase(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.FullErase>
): Promise<HistoryAction<HistoryEvent.FullErase>> {
  const { canvas } = ctx

  // Capture state before erasing to allow for undoing this redo
  const prevCanvasJSON = canvas.toJSON()

  // Execute the erase action
  fullErase()

  return { ...action, params: { prevCanvasJSON } }
}

export async function undoFullErase(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.FullErase>
): Promise<HistoryAction<HistoryEvent.FullErase>> {
  const { canvas } = ctx

  await canvas.loadFromJSON(action.params.prevCanvasJSON)

  canvas.requestRenderAll()

  return action
}

export async function undoChangeBackgroundColor(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.BackgroundColorChanged>
): Promise<HistoryAction<HistoryEvent.BackgroundColorChanged>> {
  const { canvas } = ctx

  const currentColor = canvas.backgroundColor as string
  canvas.backgroundColor = action.params.previousColor

  canvas.requestRenderAll()

  return { ...action, params: { previousColor: currentColor } }
}