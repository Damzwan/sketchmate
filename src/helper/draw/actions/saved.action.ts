import { Canvas, IText } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { viewSavedButton } from '@/config/toast.config'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw/draw.store'
import { useAppStore } from '@/store/app.store'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'
import { canvasToBuffer, cloneObjects, enlivenObjects, isText, setObjectId } from '@/helper/draw/draw.helper'
import { useHistory } from '@/service/draw/history.service'
import { DrawTool } from '@/types/draw.types'
import { applyCurve } from '@/helper/draw/actions/text.action'

export async function createSaved(c: Canvas, options: any) {
  const { user } = useAppStore()
  const { loadingText, isLoading } = storeToRefs(useDrawStore())
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
  const img = await canvasToBuffer(tempCanvas.toDataURL())

  const saved = await createSaved({ _id: user!._id, drawing: json, img: img })
  user!.saved.push(saved!)
  isLoading.value = false
  toast('Saved drawing', { buttons: [viewSavedButton] })
}

export async function addSavedToCanvas(c: fabric.Canvas, options: any) {
  const { addToUndoStack, actionWithoutHistory } = useHistory()
  const { selectTool } = useDrawStore()
  await actionWithoutHistory(async () => {
    const json = options.json
    const objects = await enlivenObjects(json.objects)

    for (let i = 0; i < objects.length; i++) {
      if (isText([objects[i]])) {
        const text = objects[i] as IText
        if (text.isCurved) applyCurve(text, c)
        text.fill = json.objects[i].fill // fill gets reset for no apparent reason :(
      }

      setObjectId(objects[i])
      c!.add(objects[i])
    }

    selectTool(DrawTool.Select)
    addToUndoStack(objects, 'object:added')

    c.discardActiveObject()
    if (objects.length == 1) c.setActiveObject(objects[0])
    else c!.setActiveObject(new fabric.ActiveSelection(objects, { canvas: c }))
  })
}
