import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { viewSavedButton } from '@/config/toast.config'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw/draw.store'
import { useAppStore } from '@/store/app.store'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'
import { cloneObjects, enableObjectIdSaving, enlivenObjects } from '@/helper/draw/draw.helper'
import { useHistory } from '@/service/draw/history.service'
import { DrawTool } from '@/types/draw.types'

export async function createSaved(c: Canvas, options: any) {
  const { loadingText } = storeToRefs(useDrawStore())
  const { isLoading, user } = storeToRefs(useAppStore())
  const { createSaved } = useAPI()
  const { toast } = useToast()

  const objects: fabric.Object[] = options['objects']

  isLoading.value = true
  loadingText.value = 'Saving drawing...'

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  // Calculate the bounding box for the objects
  objects.forEach(obj => {
    const boundingRect = obj.getBoundingRect(true) // Pass true to get a box that surrounds the entire object even if it's rotated
    minX = Math.min(minX, boundingRect.left)
    minY = Math.min(minY, boundingRect.top)
    maxX = Math.max(maxX, boundingRect.left + boundingRect.width)
    maxY = Math.max(maxY, boundingRect.top + boundingRect.height)
  })

  const width = maxX - minX
  const height = maxY - minY

  const tempCanvas = new fabric.StaticCanvas(null, { width: width, height: height })

  const clonedObjects = await cloneObjects(objects)

  // Add objects to the canvas
  clonedObjects.forEach(obj => {
    obj.set({
      left: obj.left! - minX,
      top: obj.top! - minY
    })
    tempCanvas.add(obj)
  })

  tempCanvas.renderAll()

  // Save canvas as JSON and DataURL
  const json = JSON.stringify(tempCanvas.toJSON())
  const dataUrl = tempCanvas.toDataURL()

  const saved = await createSaved({ _id: user.value!._id, drawing: json, img: dataUrl })
  user.value?.saved.push(saved!)
  isLoading.value = false
  toast('Saved drawing', { buttons: [viewSavedButton] })
}

export async function addSavedToCanvas(c: fabric.Canvas, options: any) {
  const { customSaveAction } = useHistory()
  const { selectTool } = useDrawStore()
  await customSaveAction(async () => {
    const json = options.json
    const objects = await enlivenObjects(json.objects)

    // Only load objects
    objects.forEach((object: fabric.Object) => {
      enableObjectIdSaving(object)
      c!.add(object)
    })

    selectTool(DrawTool.Select)
    c!.setActiveObject(new fabric.ActiveSelection(objects, { canvas: c }))
  })
}
