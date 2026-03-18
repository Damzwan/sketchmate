import { useDrawStore } from '@/draw/store/draw.store'
import * as fabric from 'fabric'
import { DrawAction, DrawActionParams, DrawTool } from '@/draw/types/draw.types'
import { centerObjectInViewport } from '@/draw/helpers/viewport.helper'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'


export async function addImageToCanvas(params: DrawActionParams[DrawAction.AddImage]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const fabricImg = await fabric.Image.fromURL(params.imageUrl, { crossOrigin: 'anonymous' })

  const maxDimension = 256 // Maximum width or height for scaling
  fabricImg.scaleToWidth(maxDimension)
  centerObjectInViewport(c, fabricImg)

  c.add(fabricImg)
  const { selectTool, selectedTool } = useToolSelection()
  if (selectedTool !== DrawTool.Select) {
    selectTool(DrawTool.Select)
  }

  c.setActiveObject(fabricImg)


  c.requestRenderAll()
}

export function addFilterToImg(params: DrawActionParams[DrawAction.AddImgFilter]) {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()

  const img = params.image
  const filter = params.filter

  if (params.remove) {
    const filterIndexToFind = img.filters!.findIndex((f: any) => f.type == filter.type)
    if (filterIndexToFind == -1) return
    const f = img.filters?.at(filterIndexToFind)
    c.fire('imgFilterChanged', { target: img, prevFilter: f, filter: null })

    img.filters?.splice(filterIndexToFind, 1)
  } else {
    c.fire('imgFilterChanged', { target: img, prevFilter: null, filter: filter })
    if (filter.type == 'BlendColor') img.filters = img.filters?.filter((f: any) => f.type != 'BlendColor')
    img.filters?.push(filter)
  }

  img.applyFilters()
  c.requestRenderAll()
}




