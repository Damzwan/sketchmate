import { defineStore } from 'pinia'
import { ActiveSelection, Canvas, FabricObject } from 'fabric'
import { FabricEvent, ObjectType } from '@/draw/types/draw.types'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import { fabricObjectToEntry, getViewportRect, Quadtree, QuadtreeEntry, Rect } from '@/draw/utils/QuadTree'
import { CANVAS_SIZE } from '@/draw/config/canvas.config'

export const useDrawObjectManager = defineStore('drawObjectManager', () => {
  let c: Canvas | undefined = undefined

  let objectMap = new Map<string, FabricObject>()


  const quadtree = new Quadtree<FabricObject>(
    new Rect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
  )
  const entryMap = new Map<string, QuadtreeEntry<FabricObject>>()
  let lastVisible = new Set<string>()
  let visibilityScheduled = false


  const events: FabricEvent[] = [
    {
      on: 'object:added',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        if (!obj.id) return
        objectMap.set(obj.id, obj)
        addToQuadTree(obj)
      }
    },
    {
      on: 'object:removed',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        if (!obj.id) return
        objectMap.delete(obj.id)
        removeFromQuadTree(obj)
      }
    },
    {
      on: 'object:modified',
      handler: (e: any) => {
        const obj = e.target as FabricObject

        if (obj.type == ObjectType.selection) {
          c!.getActiveObjects().forEach(o => {
            updateQuadTree(o)
          })
        } else updateQuadTree(obj)
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

  function addStartingCanvasObjects() {
    objectMap = new Map<string, FabricObject>()
    lastVisible = new Set<string>()
    quadtree.clear()
    c!.getObjects().forEach(obj => {
      objectMap.set(obj.id!, obj)
      addToQuadTree(obj)
    })

    updateVisibility()
  }

  function updateVisibility(): void {
    return // TODO
    if (visibilityScheduled) return
    visibilityScheduled = true

    requestAnimationFrame(() => {
      visibilityScheduled = false
      const viewport = getViewportRect(c!)
      const visible = quadtree.query(viewport)


      const nextVisible = new Set<string>()

      for (const e of visible) {
        nextVisible.add(e.id)
        if (!lastVisible.has(e.id)) {
          objectMap.get(e.id)!.visible = true
        }
      }

      for (const id of lastVisible) {
        if (!nextVisible.has(id)) {
          if (!objectMap.has(id)) continue
          objectMap.get(id)!.visible = false
        }
      }

      lastVisible = nextVisible
    })
  }

  function addToQuadTree(obj: FabricObject) {
    const entry = fabricObjectToEntry(obj)
    entryMap.set(obj.id, entry)
    quadtree.insert(entry)
  }

  function removeFromQuadTree(
    obj: FabricObject
  ): void {
    const entry = entryMap.get(obj.id)
    if (entry) {
      quadtree.remove(entry)
      entryMap.delete(obj.id)
    }

  }

  function updateQuadTree(obj: FabricObject): void {
    const entry = entryMap.get(obj.id)
    if (!entry) return

    const b = obj.getBoundingRect()

    entry.bounds.x = b.left
    entry.bounds.y = b.top
    entry.bounds.w = b.width
    entry.bounds.h = b.height

    quadtree.update(entry)
  }

  function getVisibleObjects(): FabricObject[] {
    const viewport = getViewportRect(c!)
    const visible = quadtree.query(viewport)
    return visible.map(item => objectMap.get(item.id)).filter(i => !!i)
  }


  return {
    init,
    getObjectsById,
    getObjectById,
    updateVisibility,
    updateQuadTree,
    addStartingCanvasObjects,
    getVisibleObjects
  }
})