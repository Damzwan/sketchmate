import { Canvas, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawTool } from '@/types/draw.types'
import { useSelect } from '@/service/draw/tools/select.tool'
import { storeToRefs } from 'pinia'
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
  const { saveState } = useHistory()
  const { selectedObjectsRef } = useSelect()

  const textObj = selectedObjectsRef[0] as fabric.IText
  const fontFaceObserver = new FontFaceObserver(font)
  await fontFaceObserver.load()
  textObj.set({ fontFamily: font })

  popoverController.dismiss()
  saveState()

  c.renderAll()
}

export async function changeFontWeight(c: Canvas, options: any) {
  const { saveState } = useHistory()
  const { selectedObjectsRef } = storeToRefs(useSelect())
  const weight = options['weight']

  const textObj = selectedObjectsRef.value[0] as fabric.IText
  textObj.set({ fontWeight: weight })
  selectedObjectsRef.value = [textObj]
  saveState()

  c.renderAll()
}

export async function changeFontStyle(c: Canvas, options: any) {
  const { saveState } = useHistory()
  const { selectedObjectsRef } = useSelect()
  const style = options['style']

  const textObj = selectedObjectsRef[0] as fabric.IText
  textObj.set({ fontStyle: style })
  saveState()
  c.renderAll()
}

export async function changeTextAlign(c: Canvas, options: any) {
  const { saveState } = useHistory()
  const { selectedObjectsRef } = useSelect()
  const align = options['align']

  const textObj = selectedObjectsRef[0] as fabric.IText
  textObj.set({ textAlign: align })
  saveState()
  c.renderAll()
}

export async function curveText(c: Canvas) {
  const { saveState } = useHistory()
  const { selectedObjectsRef } = useSelect()
  const text = selectedObjectsRef[0] as fabric.IText

  if (text.isCurved) delete text.path
  else applyCurve(text, c)

  text.set({ isCurved: !text.isCurved })

  saveState()
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
