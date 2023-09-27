import { Canvas, IPoint, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawEvent, DrawTool } from '@/types/draw.types'
import { useSelect } from '@/service/draw/tools/select.tool'
import FontFaceObserver from 'fontfaceobserver'
import { useHistory } from '@/service/draw/history.service'
import { popoverController } from '@ionic/vue'
import { exitTextAddingMode } from '@/helper/draw/draw.helper'
import { BLACK, ERASERS, PENMENUTOOLS } from '@/config/draw/draw.config'
import { useEventManager } from '@/service/draw/eventManager.service'
import { storeToRefs } from 'pinia'

export function addText(c: Canvas) {
  const { isolatedSubscribe } = useEventManager()
  const { selectedTool } = useDrawStore()
  const { addTextMode } = storeToRefs(useDrawStore())

  addTextMode.value = true

  if (PENMENUTOOLS.includes(selectedTool) || ERASERS.includes(selectedTool)) {
    c.isDrawingMode = false
  }

  isolatedSubscribe({
    on: 'mouse:down',
    type: DrawEvent.AddText,
    handler: (options: any) => {
      addTextHelper(c, options.absolutePointer as fabric.IPoint)
      exitTextAddingMode()
    }
  })
}

async function addTextHelper(c: Canvas, location: IPoint) {
  const { selectTool } = useDrawStore()
  const { disableHistorySaving, enableHistorySaving } = useHistory()
  disableHistorySaving()
  const text = new fabric.IText('', {
    left: location.x,
    top: location.y,
    fontFamily: 'Arial',
    lineHeight: 0.9,
    originX: 'center',
    originY: 'center',
    fill: BLACK
  })
  text.init = true

  c.add(text)
  selectTool(DrawTool.Select)
  c.setActiveObject(text)
  text.set({ hasControls: false }) // this is necessary sadly

  text.enterEditing()
  text.hiddenTextarea!.focus()
  c.requestRenderAll()
  enableHistorySaving()
}

// it is important to use selectedObjectsRef for reactivity purposes
export async function changeFont(c: Canvas, options: any) {
  const font = options['font']
  const { addToUndoStack } = useHistory()
  const { selectedObjectsRef } = useSelect()

  const textObj = selectedObjectsRef[0] as fabric.IText
  const fontFaceObserver = new FontFaceObserver(font)
  await fontFaceObserver.load()

  if (textObj.text != '') addToUndoStack([textObj.toObject()], 'object:modified', { textStyle: true })
  textObj.set({ fontFamily: font })

  popoverController.dismiss()

  c.renderAll()
}

export async function changeFontWeight(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { selectedObjectsRef } = useSelect()
  const weight = options['weight']

  const textObj = selectedObjectsRef[0] as fabric.IText
  if (textObj.text != '') addToUndoStack([textObj.toObject()], 'object:modified', { textStyle: true })
  textObj.set({ fontWeight: weight })

  c.renderAll()
}

export async function changeFontStyle(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { selectedObjectsRef } = useSelect()
  const style = options['style']

  const textObj = selectedObjectsRef[0] as fabric.IText
  if (textObj.text != '') addToUndoStack([textObj.toObject()], 'object:modified', { textStyle: true })
  textObj.set({ fontStyle: style })
  c.renderAll()
}

export async function changeTextAlign(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { selectedObjectsRef } = useSelect()
  const align = options['align']

  const textObj = selectedObjectsRef[0] as fabric.IText
  if (textObj.text != '') addToUndoStack([textObj.toObject()], 'object:modified', { textStyle: true })
  textObj.set({ textAlign: align })
  c.renderAll()
}

export async function curveText(c: Canvas) {
  const { addToUndoStack } = useHistory()
  const { selectedObjectsRef } = useSelect()
  const textObj = selectedObjectsRef[0] as fabric.IText

  if (textObj.isCurved) delete textObj.path
  else applyCurve(textObj, c)

  if (textObj.text != '') addToUndoStack([textObj.toObject()], 'object:modified', { textStyle: true })
  textObj.set({ isCurved: !textObj.isCurved })
  c.renderAll()
}

export function deleteCurve(text: IText) {
  delete text.path
}

export function applyCurve(text: IText, c: Canvas) {
  const textWidth = text.width!
  const textHeight = text.height!
  const curvePathWidth = textWidth + 50 // Adjust the padding as needed

  // Calculate the control point for the quadratic Bezier curve
  const controlPointX = 0
  const controlPointY = -textHeight

  const curvePathCommands = `M ${-curvePathWidth / 2} 0 Q ${controlPointX} ${controlPointY} ${curvePathWidth / 2} 0`

  const curvePath = new fabric.Path(curvePathCommands, {
    fill: '',
    stroke: ''
  })

  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  text.set({ path: curvePath })
  c.renderAll()
}
