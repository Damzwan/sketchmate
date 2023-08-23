import { Canvas } from 'fabric/fabric-impl'
import { fabric } from 'fabric'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawTool } from '@/types/draw.types'
import { useHistory } from '@/service/draw/history.service'

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
