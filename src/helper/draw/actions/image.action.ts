import { useDrawStore } from '@/store/draw/draw.store'
import * as fabric from 'fabric'
import { centerObjectInViewport } from '@/helper/draw/draw.helper'
import { DrawTool } from '@/types/draw.types'


export async function addImageToCanvas(params: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const imageURL = params['img']
  const fabricImg = await fabric.Image.fromURL(imageURL, { crossOrigin: 'anonymous' })

  const maxDimension = 256 // Maximum width or height for scaling
  fabricImg.scaleToWidth(maxDimension)
  centerObjectInViewport(c, fabricImg)

  c.add(fabricImg)
  const { selectTool, selectedTool } = useDrawStore()
  if (selectedTool !== DrawTool.Select) {
    selectTool(DrawTool.Select)
  }

  const lastObject = c.getObjects().at(-1)!
  c.setActiveObject(lastObject)


  c.requestRenderAll()
}

export function addFilterToImg(options?: any) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const img = options['object'] as fabric.Image
  const filter = options['filter'] as any
  const remove = options['remove']

  if (remove) {
    const filterIndexToFind = img.filters!.findIndex((f: any) => f.type == filter.type)
    if (filterIndexToFind == -1) return
    const f = img.filters?.at(filterIndexToFind)
    c.fire('imgFilterChanged', { target: [img], prevFilter: f })

    img.filters?.splice(filterIndexToFind, 1)
  } else {
    c.fire('imgFilterChanged', { target: [img], prevFilter: null })
    if (filter.type == 'BlendColor') img.filters = img.filters?.filter((f: any) => f.type != 'BlendColor')
    img.filters?.push(filter)
  }

  img.applyFilters()
  c.requestRenderAll()
}




