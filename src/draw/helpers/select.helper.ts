import { useDrawStore } from '@/draw/store/draw.store'
import { Canvas, FabricObject } from 'fabric'

export function enableSelection() {
  const { getCanvas } = useDrawStore()
  const c: Canvas = getCanvas()
  c.selection = true // Enable group selection
  c.forEachObject((obj) => {
    obj.set('selectable', true)
    obj.set('evented', true)
    obj.set('hasControls', true)
    obj.set('hasBorders', true)
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

export function disableSelection2() {
  const { getCanvas } = useDrawStore()
  const c: Canvas = getCanvas()
  c.selection = false
  c.forEachObject((obj) => {
    obj.selectable = false
  })
  c.requestRenderAll()
}

export function setObjectSelection(obj: FabricObject, enabled: boolean) {
  obj.set({
    hasBorders: enabled,
    selectable: enabled,
    hasControls: enabled,
    evented: enabled
  })
}

export function setSelectionForObjects(objects: FabricObject[], enabled: boolean) {
  objects.forEach(obj => setObjectSelection(obj, enabled))
}