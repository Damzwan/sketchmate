import { useDrawStore } from '@/store/draw/draw.store'

export function enableSelection() {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  c.selection = true // Enable group selection
  c.forEachObject((obj) => {
    obj.selectable = true // Make all objects selectable again
  })
  c.requestRenderAll() // Re-render the canvas to apply changes
}