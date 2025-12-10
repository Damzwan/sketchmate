import * as fabric from 'fabric'
import { FabricObject } from 'fabric'
import { ObjectType } from '@/draw/types/draw.types'

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