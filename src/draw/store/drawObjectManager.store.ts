import { defineStore } from 'pinia'
import { Canvas, FabricObject } from 'fabric'
import { FabricEvent } from '@/draw/types/draw.types'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'

export const useDrawObjectManager = defineStore('drawObjectManager', () => {
  let c: Canvas | undefined = undefined

  let objectMap = new Map<string, FabricObject>()

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
    addPermanentEvents(events)
    c = canvas
    addStartingCanvasObjects()
  }

  function addStartingCanvasObjects(){
    objectMap = new Map<string, FabricObject>()
    c!.getObjects().forEach(obj => {
      objectMap.set(obj.id!, obj)
    })
  }


  return { init, getObjectsById, getObjectById, getDrawObjectMap, addStartingCanvasObjects}
})