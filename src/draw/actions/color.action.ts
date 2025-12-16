import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { useSelect } from '@/draw/store/tools/select.store'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { FabricObject } from 'fabric'
import { usePen } from '@/draw/store/tools/pen.store'
import { DrawAction, DrawActionParams, DrawTool } from '@/draw/types/draw.types'
import { exitEditing, isText } from '@/draw/helpers/text.helper'
import { ERASERS, PENMENUTOOLS, SELECTMENUTOOLS } from '@/draw/config/tools.config'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useDrawUIStore } from '@/draw/store/drawUI.store'

export async function setCanvasBackground(params: DrawActionParams[DrawAction.SetCanvasBackground]) {
  const { getCanvas } = useDrawStore()
  const { backgroundColor } = storeToRefs(useDrawStore())

  const c = getCanvas()
  const previousColour = c.backgroundColor as string

  backgroundColor.value = params.color
  c.backgroundColor = backgroundColor.value
  c.fire('backgroundColorChanged', { previousColor: previousColour })
  c.requestRenderAll()
}

type StyleOptions<T extends FabricObject = FabricObject> = {
  style: Partial<T>;
};

function applyStyle<T extends FabricObject = FabricObject>(options: StyleOptions<T>) {
  const { getCanvas } = useDrawStore()
  const canvas = getCanvas()
  const { selectedObjectsRef } = useSelect()
  const { style } = options

  if (!selectedObjectsRef.length) return

  // Save previous styles for event
  const prevStyles: Partial<T>[] = selectedObjectsRef.map((obj) => {
    const saved: Partial<T> = {}
    for (const key in style) {
      // @ts-ignore
      saved[key as keyof T] = obj[key as keyof T]
    }
    return saved
  })

  // Exit text edit mode if needed
  if (isText(selectedObjectsRef)) exitEditing(selectedObjectsRef[0])

  // Apply style to each object
  selectedObjectsRef.forEach((obj) => {
    for (const key in style) {
      obj.set(key, style[key as keyof T])
    }
  })

  // Fire Fabric event
  canvas.fire('objectStyleChanged', {
    target: selectedObjectsRef,
    prevStyles
  })

  canvas.requestRenderAll()
}

export function setStrokeColor(params: DrawActionParams[DrawAction.SetObjectStrokeColor]) {
  const color = params.color
  applyStyle({ style: { stroke: color } })
}

export function setFillColor(params: DrawActionParams[DrawAction.SetObjectFillColor]) {
  const color = params.color
  applyStyle({ style: { fill: color } })
}

export function setBackgroundColor(params: DrawActionParams[DrawAction.SetObjectBackgroundColor]) {
  const color = params.color
  applyStyle({
    style: { backgroundColor: color }
  })
}

export function changeStrokeWidth(params: DrawActionParams[DrawAction.ChangeStrokeWidth]) {
  const strokeWidth = params.strokeWidth
  applyStyle({ style: { strokeWidth } })
}

export function exitColorPickerMode(params: DrawActionParams[DrawAction.ExitColorPickerMode]) {
  const { colorPickerMode } = storeToRefs(useDrawUIStore())
  const { getCanvas } = useDrawStore()
  const { selectedTool } = useToolSelection()
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
  } else if (selectedTool === DrawTool.Select) {
    c.selection = true
    c.skipTargetFind = false

    if (params.lastSelectedObjectRef) c.setActiveObject(params.lastSelectedObjectRef)
  }
}



