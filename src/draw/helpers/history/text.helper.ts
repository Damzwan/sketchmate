import { IText } from 'fabric'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'

/**
 * Triggered after text editing is complete.
 * This determines if the text is new (ObjectAdded) or modified (TextChanged).
 */
export function handleTextModification(obj: any) {
  if (obj.init) {
    obj.init = false
    return {
      type: HistoryEvent.ObjectAdded,
      params: { objectJSON: obj.toJSON() }
    }
  } else {
    // Fabric 6/7 stores the previous text state during editing in _textBeforeEdit
    const oldText = obj._textBeforeEdit || ''
    return {
      type: HistoryEvent.TextChanged,
      params: {
        objectId: obj.id,
        prevText: oldText,
        newText: obj.text
      }
    }

  }
}

export async function undoTextChanged(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.TextChanged>
): Promise<HistoryAction<HistoryEvent.TextChanged>> {
  const { canvas, getObjectById } = ctx
  const textObject = getObjectById(action.params.objectId) as IText

  if (textObject) {
    const currentText = textObject.text
    textObject.set('text', action.params.prevText)

    // Swap for the next redo
    action.params.prevText = currentText

    canvas.requestRenderAll()
  }

  return action
}

export async function redoTextChanged(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.TextChanged>
): Promise<HistoryAction<HistoryEvent.TextChanged>> {
  const { canvas, getObjectById } = ctx
  const textObject = getObjectById(action.params.objectId) as IText

  if (textObject) {
    const currentText = textObject.text
    textObject.set('text', action.params.prevText)

    // Swap for the next undo
    action.params.prevText = currentText

    canvas.requestRenderAll()
  }

  return action
}

export async function undoTextStyleChanged(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.TextStyleChanged>
): Promise<HistoryAction<HistoryEvent.TextStyleChanged>> {
  const { canvas, getObjectById } = ctx
  const textObject = getObjectById(action.params.objectId) as any

  if (textObject) {
    const currentStyles: any = {}

    Object.entries(action.params.prevStyle).forEach(([key, value]) => {
      // Capture current style before overriding
      currentStyles[key] = textObject[key]
      textObject.set(key as any, value)
    })

    // Store the captured styles back into the action for redo
    action.params.prevStyle = currentStyles

    canvas.requestRenderAll()
  }

  return action
}

export async function redoTextStyleChanged(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.TextStyleChanged>
): Promise<HistoryAction<HistoryEvent.TextStyleChanged>> {
  const { canvas, getObjectById } = ctx
  const textObject = getObjectById(action.params.objectId) as any

  if (textObject) {
    const currentStyles: any = {}

    Object.entries(action.params.prevStyle).forEach(([key, value]) => {
      currentStyles[key] = textObject[key]
      textObject.set(key as any, value)
    })

    action.params.prevStyle = currentStyles

    canvas.requestRenderAll()
  }

  return action
}