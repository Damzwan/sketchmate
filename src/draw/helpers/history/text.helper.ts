import { IText } from 'fabric'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import { HistoryAction, HistoryEvent } from '@/draw/types/drawHistory.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'

export function handleTextModification(obj: IText) {
  const { addToUndoStack } = useDrawHistoryManager()

  if (obj.init) {
    addToUndoStack({
      type: HistoryEvent.ObjectAdded,
      params: { objectJSON: obj.toJSON() }
    })
    obj.init = false
  } else {
    // @ts-ignore
    obj.oldText = obj._textBeforeEdit
    addToUndoStack({
      type: HistoryEvent.TextChanged,
      params: {
        objectId: obj.id,
        prevText: obj.oldText!,
        newText: obj.text
      }
    })
  }
}

export async function undoTextChanged(action: HistoryAction<HistoryEvent.TextChanged>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectById } = useDrawObjectManager()


  const c = getCanvas()
  const textObject = getObjectById(action.params.objectId) as IText

  const prevText = textObject.text
  textObject.set('text', action.params.prevText)
  action.params.prevText = prevText


  c.requestRenderAll()
  addToRedoStack({ ...action })
}

export async function undoTextStyleChanged(action: HistoryAction<HistoryEvent.TextStyleChanged>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToRedoStack } = useDrawHistoryManager()
  const { getObjectById } = useDrawObjectManager()


  const c = getCanvas()
  const textObject = getObjectById(action.params.objectId) as IText

  const prevStyle: any = {}

  Object.entries(action.params.prevStyle).forEach(([key, value]) => {
    // @ts-ignore
    prevStyle[key] = textObject[key]
    textObject.set(key, value)
  })
  action.params.prevStyle = prevStyle

  c.requestRenderAll()
  addToRedoStack({ ...action })
}

export async function redoTextStyleChanged(action: HistoryAction<HistoryEvent.TextStyleChanged>): Promise<void> {
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectById } = useDrawObjectManager()


  const textObject = getObjectById(action.params.objectId) as any

  const prevStyle: any = {}

  Object.entries(action.params.prevStyle).forEach(([key, value]) => {
    prevStyle[key] = textObject[key]
    textObject.set(key, value)
  })

  addToUndoStack({ ...action, params: { ...action.params, prevStyle } })

}

export async function redoTextChanged(action: HistoryAction<HistoryEvent.TextChanged>): Promise<void> {
  const { getCanvas } = useDrawStore()
  const { addToUndoStack } = useDrawHistoryManager()
  const { getObjectById } = useDrawObjectManager()


  const c = getCanvas()
  const textObject = getObjectById(action.params.objectId) as IText


  const prevText = textObject.text
  textObject.set('text', action.params.prevText)
  action.params.prevText = prevText


  c.requestRenderAll()
  addToUndoStack({ ...action })
}