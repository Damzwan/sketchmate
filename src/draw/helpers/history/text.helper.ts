import { IText } from 'fabric'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { HistoryContext } from '@/draw/config/drawHistory.config'
import { DrawSyncingEvent } from '@/draw/types/drawSyncing.types'
import { toJSON } from '@/draw/helpers/object.helper'

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

// TODO draw history and syncer are similar
// TODO hacky now
export function handleTextModificationSync(obj: any) {
  const oldText = obj._textBeforeEdit
  if (oldText === '') {
    return {
      type: DrawSyncingEvent.added,
      params: { objectJSONS: toJSON([obj]) }
    }
  } else {
    return {
      type: DrawSyncingEvent.TextChanged,
      params: {
        objectId: obj.id,
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

  let currentText = ''
  if (textObject) {
    currentText = textObject.text
    textObject.set('text', action.params.prevText)
    canvas.requestRenderAll()
  }

  return { ...action, params: { ...action.params, prevText: currentText } }
}

export async function redoTextChanged(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.TextChanged>
): Promise<HistoryAction<HistoryEvent.TextChanged>> {
  const { canvas, getObjectById } = ctx
  const textObject = getObjectById(action.params.objectId) as IText

  let currentText = ''
  if (textObject) {
    currentText = textObject.text
    textObject.set('text', action.params.prevText)
    canvas.requestRenderAll()
  }

  return { ...action, params: { ...action.params, prevText: currentText } }
}

export async function undoTextStyleChanged(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.TextStyleChanged>
): Promise<HistoryAction<HistoryEvent.TextStyleChanged>> {
  const { canvas, getObjectById } = ctx
  const textObject = getObjectById(action.params.objectId) as any
  const currentStyles: any = {}

  if (textObject) {
    Object.entries(action.params.prevStyle).forEach(([key, value]) => {
      // Capture current style before overriding
      currentStyles[key] = textObject[key]
      textObject.set(key as any, value)
    })

    canvas.requestRenderAll()
  }

  // Return a new object rather than modifying 'action'
  return {
    ...action,
    params: {
      ...action.params,
      prevStyle: currentStyles
    }
  }
}

export async function redoTextStyleChanged(
  ctx: HistoryContext,
  action: HistoryAction<HistoryEvent.TextStyleChanged>
): Promise<HistoryAction<HistoryEvent.TextStyleChanged>> {
  const { canvas, getObjectById } = ctx
  const textObject = getObjectById(action.params.objectId) as any
  const currentStyles: any = {}

  if (textObject) {
    Object.entries(action.params.prevStyle).forEach(([key, value]) => {
      // Capture current style before overriding
      currentStyles[key] = textObject[key]
      textObject.set(key as any, value)
    })

    canvas.requestRenderAll()
  }

  // Return a new object rather than modifying 'action'
  return {
    ...action,
    params: {
      ...action.params,
      prevStyle: currentStyles
    }
  }
}