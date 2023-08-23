import { Canvas, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawTool } from '@/types/draw.types'
import { useSelect } from '@/service/draw/tools/select.tool'
import FontFaceObserver from 'fontfaceobserver'
import { useHistory } from '@/service/draw/history.service'
import { popoverController } from '@ionic/vue'

export function addText(c: Canvas) {
  const { selectTool } = useDrawStore()
  const { disableHistorySaving, enableHistorySaving } = useHistory()
  disableHistorySaving()
  const text = new fabric.IText('', {
    left: c.width! / 2,
    top: c.height! / 4,
    fontFamily: 'Arial',
    lineHeight: 0.9,
    originX: 'center',
    originY: 'center'
  })
  text.init = true

  c.add(text)

  selectTool(DrawTool.Select)
  text.set({ hasControls: false }) // this is necessary sadly
  c.renderAll()

  // The timeout will make sure that the text object is fully added to the canvas before trying to edit it
  setTimeout(() => {
    text.enterEditing()
    text.hiddenTextarea!.focus() // This line is especially important for mobile
    enableHistorySaving()
  }, 300)
}

export async function changeFont(c: Canvas, options: any) {
  const font = options['font']
  const { addToUndoStack } = useHistory()
  const { getSelectedObjects } = useSelect()
  const selectedObjects = getSelectedObjects()

  const textObj = selectedObjects[0] as fabric.IText
  const fontFaceObserver = new FontFaceObserver(font)
  await fontFaceObserver.load()

  addToUndoStack([textObj.toObject()], 'object:modified', { textStyle: true })
  textObj.set({ fontFamily: font })

  popoverController.dismiss()

  c.renderAll()
}

export async function changeFontWeight(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { getSelectedObjects } = useSelect()
  const selectedObjects = getSelectedObjects()
  const weight = options['weight']

  const textObj = selectedObjects[0] as fabric.IText
  addToUndoStack([textObj.toObject()], 'object:modified', { textStyle: true })
  textObj.set({ fontWeight: weight })

  c.renderAll()
}

export async function changeFontStyle(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { getSelectedObjects } = useSelect()
  const selectedObjects = getSelectedObjects()
  const style = options['style']

  const textObj = selectedObjects[0] as fabric.IText
  addToUndoStack([textObj.toObject()], 'object:modified', { textStyle: true })
  textObj.set({ fontStyle: style })
  c.renderAll()
}

export async function changeTextAlign(c: Canvas, options: any) {
  const { addToUndoStack } = useHistory()
  const { getSelectedObjects } = useSelect()
  const selectedObjects = getSelectedObjects()
  const align = options['align']

  const textObj = selectedObjects[0] as fabric.IText
  addToUndoStack([textObj.toObject()], 'object:modified', { textStyle: true })
  textObj.set({ textAlign: align })
  c.renderAll()
}

export async function curveText(c: Canvas) {
  const { addToUndoStack } = useHistory()
  const { getSelectedObjects } = useSelect()
  const selectedObjects = getSelectedObjects()
  const textObj = selectedObjects[0] as fabric.IText

  if (textObj.isCurved) delete textObj.path
  else applyCurve(textObj, c)

  addToUndoStack([textObj.toObject()], 'object:modified', { textStyle: true })
  textObj.set({ isCurved: !textObj.isCurved })
  c.renderAll()
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
