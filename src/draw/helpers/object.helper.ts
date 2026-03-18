import * as fabric from 'fabric'
import { type Canvas, FabricObject, FabricObjectProps } from 'fabric'
import { ObjectType } from '@/draw/types/draw.types'
import { HistoryAction } from '@/draw/types/drawHistory.types'
import { ref } from 'vue'

export function toObjectsIds(objects: FabricObject[]): string[] {
  return objects.map(item => item.id)
}

export function toJSON(objects: FabricObject[]): string[] {
  return objects.map(item => item.toJSON())
}

export function setCacheForObjects(objects: fabric.Object[], enabled: boolean) {
  objects.forEach(o => {
    if (o.type == ObjectType.group) setCacheForObjects((o as fabric.Group).getObjects(), enabled)
    o.objectCaching = enabled
  })
}

export function getAbsoluteState(obj: FabricObject): Partial<FabricObjectProps> {
  const matrix = obj.calcTransformMatrix()

  const decomposed = fabric.util.qrDecompose(matrix)

  return {
    left: decomposed.translateX,
    top: decomposed.translateY,
    scaleX: decomposed.scaleX,
    scaleY: decomposed.scaleY,
    angle: decomposed.angle
  }
}
