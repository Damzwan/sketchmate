import { BLACK } from '@/config/draw/draw.config'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw/draw.store'
import { Canvas, Point, IText } from 'fabric'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'
import { DrawTool } from '@/types/draw.types'
import { useSelect } from '@/store/draw/tools/select.store'
import FontFaceObserver from 'fontfaceobserver'

export function addText() {
  const { getCanvas } = useDrawStore()
  const { prevDrawingMode } = storeToRefs(useDrawStore())
  const { addEventsOfService, removeEventsOfService } = useDrawEventManager()
  const { addTextMode } = storeToRefs(useDrawStore())

  const c = getCanvas()

  addTextMode.value = true
  prevDrawingMode.value = c.isDrawingMode
  c.isDrawingMode = false

  addEventsOfService('text', [{
    on: 'mouse:down', handler: (options: any) => {
      addTextMode.value = false
      if (prevDrawingMode) c.isDrawingMode = true
      removeEventsOfService('text')
      void addTextHelper(c, options.absolutePointer as
        Point)
    }
  }])
}

async function addTextHelper(c: Canvas, location: Point) {
  const { selectTool } = useDrawStore()
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

  selectTool(DrawTool.Select)
  c.setActiveObject(text)
  text.set({ hasControls: false }) // this is necessary sadly

  text.enterEditing()
  c.requestRenderAll()
}

export async function changeFont(options: any) {
  const font = options['font']
  const { selectedObjectsRef } = useSelect()

  const { getCanvas } = useDrawStore()
  const c = getCanvas()


  const textObj = selectedObjectsRef[0] as IText
  const fontFaceObserver = new FontFaceObserver(font)
  await fontFaceObserver.load()

  const prevStyle = {
    fontFamily: textObj.fontFamily
  }

  textObj.set({ fontFamily: font })

  c.fire('textStyleChanged', { target: [textObj], prevStyle })

  c.requestRenderAll()
}

export async function changeFontWeight(options: any) {
  const { selectedObjectsRef } = useSelect()
  const weight = options['weight']

  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const textObj = selectedObjectsRef[0] as IText

  const prevStyle = {
    fontWeight: textObj.fontWeight
  }
  textObj.set({ fontWeight: weight })
  c.fire('textStyleChanged', { target: [textObj], prevStyle })

  c.requestRenderAll()
}

export async function changeTextAlign(options: any) {
  const { selectedObjectsRef } = useSelect()
  const align = options['align']

  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const textObj = selectedObjectsRef[0] as IText

  const prevStyle = {
    fontWeight: textObj.fontWeight
  }
  textObj.set({ textAlign: align })
  c.fire('textStyleChanged', { target: [textObj], prevStyle })
  c.requestRenderAll()
}

export async function changeFontStyle(options: any) {
  const { selectedObjectsRef } = useSelect()
  const style = options['style']

  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const textObj = selectedObjectsRef[0] as IText
  const prevStyle = {
    fontStyle: textObj.fontStyle
  }
  textObj.set({ fontStyle: style })
  c.fire('textStyleChanged', { target: [textObj], prevStyle })
  c.requestRenderAll()
}

export function exitTextAddingMode() {
  const { getCanvas, prevDrawingMode } = useDrawStore()
  const { removeEventsOfService } = useDrawEventManager()
  const { addTextMode } = storeToRefs(useDrawStore())

  const c = getCanvas()

  c.isDrawingMode = prevDrawingMode
  addTextMode.value = false

  removeEventsOfService('text')
}
