import { defineStore } from 'pinia'
import { Canvas, FabricObject } from 'fabric'
import { FabricEvent } from '@/types/draw.types'
import { useDrawEventManager } from '@/store/draw/drawEventManager.store'

export const useDrawObjectManager = defineStore('drawObjectManager', () => {
  let c: Canvas | undefined = undefined

  const objectMap = new Map<string, FabricObject>()

  const events: FabricEvent[] = [
    {
      on: 'object:added',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        if (!obj.id) return
        objectMap.set(obj.id, obj)
      }
    },
    {
      on: 'object:removed',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        if (!obj.id) return
        objectMap.delete(obj.id)
      }
    }
  ]


  function getObjectById(id: string): FabricObject | undefined {
    return objectMap.get(id)
  }

  function getObjectsById(ids: string[]): FabricObject[] {
    return ids.map(id => getObjectById(id)).filter(obj => !!obj)
  }

  function getDrawObjectMap() {
    return objectMap
  }

  function init(canvas: Canvas) {
    const { addPermanentEvents } = useDrawEventManager()

    c = canvas

    c.getObjects().forEach(obj => {
      objectMap.set(obj.id!, obj)
    })
    addPermanentEvents(events)
  }


  return { init, getObjectsById, getObjectById, getDrawObjectMap }
})