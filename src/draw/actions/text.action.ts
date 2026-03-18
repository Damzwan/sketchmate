import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'
import { Canvas, IText, Point } from 'fabric'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { DrawAction, DrawActionParams, DrawTool } from '@/draw/types/draw.types'
import { useSelect } from '@/draw/store/tools/select.store'
import FontFaceObserver from 'fontfaceobserver'
import { BLACK } from '@/draw/config/canvas.config'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useDrawUIStore } from '@/draw/store/drawUI.store'

export function addText() {
  const { getCanvas } = useDrawStore()
  const { prevDrawingMode } = storeToRefs(useDrawStore())
  const { activateExclusiveEvents, deActivateExclusiveEvents } = useDrawEventManager()
  const { addTextMode } = storeToRefs(useDrawUIStore())

  const c = getCanvas()

  addTextMode.value = true
  prevDrawingMode.value = c.isDrawingMode
  c.isDrawingMode = false

  activateExclusiveEvents([{
    on: 'mouse:down', handler: (options: any) => {
      addTextMode.value = false
      deActivateExclusiveEvents()
      void addTextHelper(c, options.absolutePointer as
        Point)
    }
  }])
}

async function addTextHelper(c: Canvas, location: Point) {
  const { selectTool, selectedTool } = useToolSelection()
  const { actionWithoutEvents } = useDrawEventManager()

  const text = new IText('', {
    left: location.x,
    top: location.y,
    fontFamily: 'Arial',
    lineHeight: 0.9,
    originX: 'center',
    originY: 'center',
    fill: BLACK
  })
  text.init = true

  await actionWithoutEvents(() => {
    c.add(text)
  })

  if (selectedTool !== DrawTool.Select) selectTool(DrawTool.Select)
  c.setActiveObject(text)

  text.enterEditing()

  text.on('editing:exited', () => {
    if (text.text === '') {
      const { unSelect } = useSelect()
      actionWithoutEvents(() => {
        unSelect()
        c.remove(text)
      })
    }
  })

  c.requestRenderAll()
}

export async function changeFont(params: DrawActionParams[DrawAction.ChangeFont]) {
  const font = params.font
  const { selectedObjectsRef } = useSelect()

  const { getCanvas } = useDrawStore()
  const c = getCanvas()


  const textObj = selectedObjectsRef[0] as IText
  const fontFaceObserver = new FontFaceObserver(font)
  await fontFaceObserver.load()

  const prevStyle = {
    fontFamily: textObj.fontFamily
  }
  const newStyle = { fontFamily: font }
  textObj.set(newStyle)

  c.fire('textStyleChanged', { target: [textObj], prevStyle, style: newStyle })

  c.requestRenderAll()
}

export async function changeFontWeight(params: DrawActionParams[DrawAction.ChangeFontWeight]) {
  const { selectedObjectsRef } = useSelect()
  const weight = params.weight

  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const textObj = selectedObjectsRef[0] as IText

  const prevStyle = {
    fontWeight: textObj.fontWeight
  }
  const newStyle = { fontWeight: weight }
  textObj.set(newStyle)
  c.fire('textStyleChanged', { target: [textObj], prevStyle, style: newStyle })

  c.requestRenderAll()
}

export async function changeTextAlign(params: DrawActionParams[DrawAction.ChangeTextAlign]) {
  const { selectedObjectsRef } = useSelect()
  const align = params.align

  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const textObj = selectedObjectsRef[0] as IText

  const prevStyle = {
    textAlign: textObj.textAlign
  }
  const newStyle = { textAlign: align }

  textObj.set(newStyle)
  c.fire('textStyleChanged', { target: [textObj], prevStyle, style: newStyle })
  c.requestRenderAll()
}

export async function changeFontStyle(params: DrawActionParams[DrawAction.ChangeFontStyle]) {
  const { selectedObjectsRef } = useSelect()
  const fontStyle = params.fontStyle

  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const textObj = selectedObjectsRef[0] as IText
  const prevStyle = {
    fontStyle: textObj.fontStyle
  }
  const newStyle = { fontStyle: fontStyle }

  textObj.set(newStyle)
  c.fire('textStyleChanged', { target: [textObj], prevStyle, style: newStyle })
  c.requestRenderAll()
}

export function exitTextAddingMode() {
  const { getCanvas, prevDrawingMode } = useDrawStore()
  const { deActivateExclusiveEvents } = useDrawEventManager()
  const { addTextMode } = storeToRefs(useDrawUIStore())

  const c = getCanvas()

  c.isDrawingMode = prevDrawingMode
  addTextMode.value = false

  deActivateExclusiveEvents()
}
