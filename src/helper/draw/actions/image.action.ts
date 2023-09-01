import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawTool } from '@/types/draw.types'
import { useHistory } from '@/service/draw/history.service'
import { popoverController } from '@ionic/vue'

export function addSticker(c: Canvas, options?: any) {
  if (!options) return
  const sticker: string = options['img']
  fabric.Image.fromURL(
    sticker,
    function (img) {
      const maxDimension = 128 // Maximum width or height for scaling
      img.scaleToWidth(maxDimension)
      c!.add(img)
      // c.moveTo(img, Layer.obj)
      const { selectTool } = useDrawStore()
      selectTool(DrawTool.Select)
    },
    { crossOrigin: 'anonymous' }
  )
}

export function setBackgroundImage(c: Canvas, options?: any) {
  if (!options) return
  const img: string = options['img']

  const { addToUndoStack } = useHistory()
  addToUndoStack([c.backgroundImage as any], 'backgroundImg')

  fabric.Image.fromURL(
    img,
    function (img) {
      // Set the image as the background and scale it to fit the canvas
      c.setBackgroundImage(
        img,
        () => {
          c.renderAll()
        },
        {
          // Options for scaling
          scaleX: c.width! / img.width!,
          scaleY: c.height! / img.height!,
          top: 0,
          left: 0
        }
      )

      c.renderAll()
    },
    { crossOrigin: 'anonymous' }
  )
}

export function addFilterToImg(c: Canvas, options?: any) {
  const { addToUndoStack } = useHistory()
  const img = options['object'] as fabric.Image
  const filter = options['filter'] as any
  const remove = options['remove']

  console.log(filter.type)

  if (remove) {
    const filterIndexToFind = img.filters!.findIndex((f: any) => f.type == filter.type)
    if (filterIndexToFind == -1) return
    const f = img.filters?.at(filterIndexToFind)
    img.filters?.splice(filterIndexToFind, 1)
    addToUndoStack([img.toObject()], 'imgFilter', { filter: f })
  } else {
    img.filters?.push(filter)
    addToUndoStack([img.toObject()], 'imgFilter')
  }

  img.applyFilters()
  c.requestRenderAll()
  popoverController.dismiss()
}
