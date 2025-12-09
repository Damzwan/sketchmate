import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { useSelect } from '@/store/draw/tools/select.store'
import { exitEditing, isText } from '@/helper/draw/draw.helper'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'
import { ERASERS, PENMENUTOOLS, SELECTMENUTOOLS } from '@/config/draw/draw.config'
import { enableSelection } from '@/helper/draw/select.helper'
import { FabricObject } from 'fabric'
import { usePen } from '@/store/draw/tools/pen.store'
import { DrawTool } from '@/types/draw.types'

export async function setCanvasBackground(params: any) {
  const { getCanvas } = useDrawStore()
  const { backgroundColor } = storeToRefs(useDrawStore())

  const c = getCanvas()
  const previousColour = c.backgroundColor

  backgroundColor.value = params.color
  c.backgroundColor = backgroundColor.value
  c.fire('backgroundColorChanged', { previousColor: previousColour })
  c.requestRenderAll()
}

function applyStyle(options: {
  style: Record<string, any>
}) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  const { selectedObjectsRef } = useSelect()
  const { style = false } = options

  if (!selectedObjectsRef.length) return

  // Save previous styles for event
  const prevStyles = selectedObjectsRef.map(obj => {
    const saved = {}
    for (const key in style) saved[key] = obj[key]
    return saved
  })

  // Exit text edit mode if needed
  if (isText(selectedObjectsRef)) exitEditing(selectedObjectsRef[0])

  // Apply style to each object
  selectedObjectsRef.forEach(obj => {
    for (const key in style) {
      const val = style[key]
      obj.set(key, val)
    }
  })

  // Use Fabric’s new event method
  c.fire('objectStyleChanged', {
    target: selectedObjectsRef,
    prevStyles
  })

  c.requestRenderAll()
}

export function setStrokeColor(options: any) {
  const color = options.color
  applyStyle({ style: { stroke: color } })
}

export function setFillColor(options: any) {
  const color = options.color
  applyStyle({ style: { fill: color } })
}

export function setBackgroundColor(options: any) {
  const color = options.color
  applyStyle({
    style: { backgroundColor: color },
    allowUnset: true
  })
}

export function changeStrokeWidth(options: any) {
  const strokeWidth = options.strokeWidth
  applyStyle({ style: { strokeWidth } })
}

export function exitColorPickerMode(lastSelectedObject?: FabricObject) {
  const { colorPickerMode } = storeToRefs(useDrawStore())
  const { selectedTool, getCanvas } = useDrawStore()
  const { updatePenCursor } = usePen()
  const { deActivateExclusiveEvents } = useDrawEventManager()
  colorPickerMode.value = false
  deActivateExclusiveEvents()

  const c = getCanvas()

  if (selectedTool === DrawTool.Pen || ERASERS.includes(selectedTool)) {
    c.isDrawingMode = true
    if (selectedTool === DrawTool.Pen) {
      updatePenCursor()
    }
  } else if (SELECTMENUTOOLS.includes(selectedTool)) {
    enableSelection()
    if (lastSelectedObject) c.setActiveObject(lastSelectedObject)
  }
}



