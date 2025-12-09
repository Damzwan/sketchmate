import { useDrawStore } from '@/store/draw/draw.store'

export function enableSelection() {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  c.selection = true // Enable group selection
  c.forEachObject((obj) => {
    obj.set('selectable', true)
    // obj.set('evented', true)
    // obj.set('hasControls', true)
    // obj.set('hasBorders', true)
  })
  c.requestRenderAll()
}

export function disableSelection() {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  c.selection = false
  c.forEachObject((obj) => {
    obj.set('selectable', false)
    // obj.set('evented', false)
    // obj.set('hasControls', false)
    // obj.set('hasBorders', false)
  })
  c.requestRenderAll()
}