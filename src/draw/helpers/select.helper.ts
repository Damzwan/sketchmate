import { useDrawStore } from '@/draw/store/draw.store'
import { Canvas, FabricObject } from 'fabric'

export function enableSelection() {
  const { getCanvas } = useDrawStore()
  const c: Canvas = getCanvas()
  c.selection = true // Enable group selection
  c.forEachObject((obj) => {
    const visible = obj.isOnScreen()

    obj.set({
      selectable: visible,
      evented: visible,
      hasControls: visible,
      hasBorders: visible
    })
  })
  c.requestRenderAll()
}

export function disableSelection() {
  const { getCanvas } = useDrawStore()
  const c: Canvas = getCanvas()
  c.selection = false
  c.forEachObject((obj) => {
    obj.set('selectable', false)
    obj.set('evented', false)
    obj.set('hasControls', false)
    obj.set('hasBorders', false)
  })
  c.requestRenderAll()
}


export function disableObjectSelection(obj: FabricObject) {
  obj.set({
    hasBorders: false,
    selectable: false,
    hasControls: false,
    evented: false
  })
}