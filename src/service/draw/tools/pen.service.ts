import { Ref, ref, watch } from 'vue'
import { BLACK, BRUSHSIZE } from '@/config/draw.config'
import { BrushType, DrawEvent, FabricEvent, ToolService } from '@/types/draw.types'
import { setObjectSelection } from '@/helper/draw/draw.helper'
import { Canvas, IPoint } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { defineStore } from 'pinia'
import { bucketFill } from '@/helper/draw/actions/bucket.action'

interface Pen extends ToolService {
  init: (c: Canvas) => void
  brushSize: Ref<number>
  brushType: Ref<BrushType>
  brushColor: Ref<string>
}

export const brushMapping: { [key in BrushType]: any } = {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  [BrushType.Circle]: (c: Canvas) => new fabric.CircleBrush(c),
  [BrushType.Pencil]: (c: Canvas) => new fabric.PencilBrush(c),
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  [BrushType.Spray]: (c: Canvas) => new fabric.SprayBrush(c),
  [BrushType.Ink]: (c: Canvas) => new fabric.InkBrush(c),
  [BrushType.Bucket]: (c: Canvas) => null
}

export const usePen = defineStore('pen', (): Pen => {
  let c: Canvas | undefined = undefined
  const brushSize = ref(BRUSHSIZE)
  const brushType = ref<BrushType>(BrushType.Pencil)
  const brushColor = ref(BLACK)
  const events: FabricEvent[] = [
    {
      type: DrawEvent.BucketFill,
      on: 'mouse:down',
      handler: async (o: any) => {
        const { brushType } = usePen()
        if (brushType != BrushType.Bucket) return

        const pointer: IPoint = c!.getPointer(o.e)
        const img = await bucketFill(c!, pointer)
        if (!img) return
        c!.add(img)
        // c.moveTo(img, Layer.background)
        c!.renderAll()
        // const collidingObjects = c.getObjects().filter(obj => img.intersectsWithObject(obj))
        // mergeObjects(c, { objects: [img, ...collidingObjects], unselect: true })
        setObjectSelection(img, false)
      }
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
  }

  async function selectBucket(c: Canvas) {
    c.isDrawingMode = false
    c.selection = false
  }

  async function select(c: Canvas) {
    c.isDrawingMode = true
    if (brushType.value == BrushType.Bucket) {
      await selectBucket(c)
      return
    }
    const newBrush = brushMapping[brushType.value](c)
    c.freeDrawingBrush = newBrush!
    c.freeDrawingBrush.width = brushSize.value
    c.freeDrawingBrush.color = brushColor.value
  }

  watch(brushSize, () => {
    c!.freeDrawingBrush.width = brushSize.value
    // brush.value.width = brushSize.value
  })

  watch(brushColor, () => {
    c!.freeDrawingBrush.color = brushColor.value
  })

  watch(brushType, value => {
    if (value == BrushType.Bucket) {
      selectBucket(c!)
      return
    }
    select(c!)
  })

  return { select, init, brushSize, brushType, brushColor, events: events }
})
