import { defineStore } from 'pinia'
import { Canvas, FabricObject } from 'fabric'
import { FabricEvent, ObjectType } from '@/draw/types/draw.types'
import { useDrawEventManager } from '@/draw/store/drawEventManager.store'
import {
  fabricObjectToEntry,
  getViewportRect,
  InfiniteQuadtreeManager,
  QuadtreeEntry,
  Rect
} from '@/draw/utils/QuadTree'
import { useGestureStore } from '@/draw/store/tools/gesture.store'
import { yieldToMain } from '@/helper/general.helper'

export const useDrawObjectManager = defineStore('drawObjectManager', () => {
  let c: Canvas | undefined = undefined

  let objectMap = new Map<string, FabricObject>()


  const quadtree = new InfiniteQuadtreeManager<FabricObject>()
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
        stampObjectToStable(c!, obj)
      }
    },
    {
      on: 'object:removed',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        if (!obj.id) return
        objectMap.delete(obj.id)
        removeFromQuadTree(obj)
        removeObjectFromStable(c!, obj, quadtree)
      }
    },
    {
      on: 'object:modified',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        const transform = e.transform

        if (obj.type == ObjectType.selection) {
          c!.getActiveObjects().forEach(o => {
            updateQuadTree(o)
          })
        } else updateQuadTree(obj)
        applyModificationPatch(c!, obj, transform.original, quadtree)
      }
    }

  ]


  function getObjectById(id: string): FabricObject | undefined {
    return objectMap.get(id)
  }


  function getObjectsById(ids: string[]): FabricObject[] {
    return ids.map(id => getObjectById(id)).filter(obj => !!obj)
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

  function updateVisibility(runSync = true): void {
    const execute = () => {
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

      renderCanvasChunked(c!, getObjectsById(Array.from(nextVisible)))
    }

    // Bypass the scheduling queue entirely if this is a sync request
    if (!runSync) {
      execute()
    } else {
      if (visibilityScheduled) return
      visibilityScheduled = true
      requestAnimationFrame(execute)
    }
  }


  let currentRenderId = 0

  let stableOffscreenCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
  let workingOffscreenCanvas: HTMLCanvasElement | OffscreenCanvas | null = null

  function getStableCanvas(width: number, height: number) {
    if (!stableOffscreenCanvas) {
      if (typeof OffscreenCanvas !== 'undefined') {
        stableOffscreenCanvas = new OffscreenCanvas(width, height)
      } else {
        stableOffscreenCanvas = document.createElement('canvas')
      }
    }
    if (stableOffscreenCanvas.width !== width || stableOffscreenCanvas.height !== height) {
      stableOffscreenCanvas.width = width
      stableOffscreenCanvas.height = height
    }
    return stableOffscreenCanvas
  }

  function getWorkingCanvas(width: number, height: number) {
    if (!workingOffscreenCanvas) {
      if (typeof OffscreenCanvas !== 'undefined') {
        workingOffscreenCanvas = new OffscreenCanvas(width, height)
      } else {
        workingOffscreenCanvas = document.createElement('canvas')
      }
    }
    if (workingOffscreenCanvas.width !== width || workingOffscreenCanvas.height !== height) {
      workingOffscreenCanvas.width = width
      workingOffscreenCanvas.height = height
    }
    return workingOffscreenCanvas
  }


  async function renderCanvasChunked(canvas: Canvas, objects: FabricObject[]) {
    const renderId = ++currentRenderId
    const gestureStore = useGestureStore()

    // 🛡️ THE MICROTASK SHIELD 🛡️
    await yieldToMain() // Using your polyfill
    if (renderId !== currentRenderId || gestureStore.isGesturing) return

    const mainCtx = canvas.getContext()

    // Use the physical element dimensions to preserve Retina scaling
    const physWidth = canvas.getElement().width
    const physHeight = canvas.getElement().height

    const workingCanvas = getWorkingCanvas(physWidth, physHeight)
    const workingCtx = workingCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

    const targetVpt = [...canvas.viewportTransform!] as number[]
    const frozenBg = canvas.backgroundColor

    workingCtx.clearRect(0, 0, workingCanvas.width, workingCanvas.height)
    if (frozenBg) {
      workingCtx.fillStyle = frozenBg as string
      workingCtx.fillRect(0, 0, workingCanvas.width, workingCanvas.height)
    }

    workingCtx.save()
    workingCtx.transform(
      targetVpt[0], targetVpt[1],
      targetVpt[2], targetVpt[3],
      targetVpt[4], targetVpt[5]
    )

    let i = 0
    const TIME_BUDGET_MS = 8

    while (i < objects.length) {
      // Check for aborts between chunks
      if (renderId !== currentRenderId || gestureStore.isGesturing) {
        workingCtx.restore()
        console.log('Surgery aborted cleanly via user input or newer render.')
        return
      }

      const frameStartTime = performance.now()

      while (i < objects.length && (performance.now() - frameStartTime) < TIME_BUDGET_MS) {
        objects[i].render(workingCtx as CanvasRenderingContext2D)
        i++
      }

      if (i < objects.length) {
        await yieldToMain()
      }
    }

    workingCtx.restore()

    // @ts-ignore
    if (!canvas.skipControlsDrawing) canvas.drawControls(workingCtx as CanvasRenderingContext2D)

    // Final check before committing the procedure to the main screen
    if (renderId === currentRenderId && !gestureStore.isGesturing) {
      gestureStore.setRenderedVpt(targetVpt)

      const stableCanvas = getStableCanvas(physWidth, physHeight)
      const stableCtx = stableCanvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

      stableCtx.clearRect(0, 0, stableCanvas.width, stableCanvas.height)
      stableCtx.drawImage(workingCanvas as CanvasImageSource, 0, 0)

      mainCtx.clearRect(0, 0, stableCanvas.width, stableCanvas.height)
      mainCtx.drawImage(stableCanvas as CanvasImageSource, 0, 0)
      canvas.fire('after:render', { ctx: mainCtx })
    }
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

  function query(rect: Rect): FabricObject [] {
    const o = quadtree.query(rect)
    return o.map(item => objectMap.get(item.id)).filter(i => !!i)
  }

  const RASTERIZE_THRESHOLD = 70

  function setVisibleObjectsState(mode: 'interaction' | 'static') {
    const visibleObjects = getVisibleObjects()

    visibleObjects.forEach((obj: any) => {
      // 1. Natural Immunity: Images and text don't need viewport cache toggling
      if (obj.type === 'image' || obj.type === 'i-text' || obj.type === 'textbox') {
        return
      }

      if (!!(obj as any)?.stroke?.source) {
        obj.objectCaching = false
        return
      }


      // @ts-ignore
      if (obj.path || (obj?.compressedTrace && obj.compressedTrace?.length)) {

        // Assess complexity: Are there enough points to justify the RAM cost?
        const isComplex = obj?.compressedTrace
          ? (obj.compressedTrace && obj.compressedTrace.length > RASTERIZE_THRESHOLD)
          : (obj.path && obj.path.length > RASTERIZE_THRESHOLD)

        if (mode === 'interaction') {
          // Drop the cache during zooming to prevent massive CPU spikes
          obj.objectCaching = false
        } else {
          // Patient has stabilized. Re-enable cache only if the path is heavy enough.
          obj.objectCaching = isComplex
          obj.dirty = isComplex
        }
      }
    })
  }

  function stampObjectToStable(canvas: Canvas, obj: FabricObject) {
    const physWidth = canvas.getElement().width
    const physHeight = canvas.getElement().height

    const stableCanvas = getStableCanvas(physWidth, physHeight)
    const stableCtx = stableCanvas.getContext('2d')!
    const vpt = canvas.viewportTransform!

    stableCtx.save()
    stableCtx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])
    obj.render(stableCtx as CanvasRenderingContext2D)
    stableCtx.restore()
  }

// 2. HOLE PUNCH (Dirty Rectangle): Erases an object's footprint and redraws neighbors
  function removeObjectFromStable(canvas: Canvas, obj: FabricObject, quadtree: any) {
    const physWidth = canvas.getElement().width
    const physHeight = canvas.getElement().height

    const stableCanvas = getStableCanvas(physWidth, physHeight)
    const stableCtx = stableCanvas.getContext('2d')!
    const vpt = canvas.viewportTransform!

    // 1. Calculate the exact logical bounding box from the object's absolute corners
    const aCoords = obj.aCoords || obj.calcACoords()
    const minX = Math.min(aCoords.tl.x, aCoords.tr.x, aCoords.bl.x, aCoords.br.x)
    const maxX = Math.max(aCoords.tl.x, aCoords.tr.x, aCoords.bl.x, aCoords.br.x)
    const minY = Math.min(aCoords.tl.y, aCoords.tr.y, aCoords.bl.y, aCoords.br.y)
    const maxY = Math.max(aCoords.tl.y, aCoords.tr.y, aCoords.bl.y, aCoords.br.y)

    const logicalWidth = maxX - minX
    const logicalHeight = maxY - minY
    const padding = 10 // Generous buffer for stroke widths and shadows

    stableCtx.save()

    // 2. Force reset the transform to prevent lingering matrix states
    stableCtx.setTransform(1, 0, 0, 1, 0, 0)

    // 3. Apply the exact viewport transform used to stamp the object
    stableCtx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])

    // 4. Erase the precise logical area.
    // Because we applied VPT, this maps perfectly to the offscreen buffer!
    stableCtx.clearRect(
      minX - padding,
      minY - padding,
      logicalWidth + padding * 2,
      logicalHeight + padding * 2
    )

    // 🚨 CRITICAL: If your canvas has a background color, you must patch the hole!
    // clearRect makes the pixels transparent. If you don't refill the color,
    // fastBlit will draw a transparent hole over the screen.
    if (canvas.backgroundColor) {
      stableCtx.fillStyle = canvas.backgroundColor as string
      stableCtx.fillRect(
        minX - padding,
        minY - padding,
        logicalWidth + padding * 2,
        logicalHeight + padding * 2
      )
    }

    // 5. Create a clipping mask in logical space
    stableCtx.beginPath()
    stableCtx.rect(
      minX - padding,
      minY - padding,
      logicalWidth + padding * 2,
      logicalHeight + padding * 2
    )
    stableCtx.clip()

    // 6. Ask the QuadTree using logical coordinates (No Division Needed!)
    const queryRect = new Rect(
      minX - padding,
      minY - padding,
      logicalWidth + padding * 2,
      logicalHeight + padding * 2
    )

    const neighbors = quadtree.query(queryRect)

    // 7. Redraw intersecting objects inside the hole
    for (const neighbor of neighbors) {
      if (neighbor.id !== obj.id) {
        neighbor.render(stableCtx as CanvasRenderingContext2D)
      }
    }

    stableCtx.restore()
  }

  function applyModificationPatch(
    canvas: Canvas,
    obj: FabricObject,
    originalState: Record<string, any>,
    quadtree: any
  ) {
    // 1. Save the NEW (current) state so we don't lose it
    const newState = {
      left: obj.left, top: obj.top,
      scaleX: obj.scaleX, scaleY: obj.scaleY,
      skewX: obj.skewX, skewY: obj.skewY,
      angle: obj.angle,
      flipX: obj.flipX, flipY: obj.flipY,
      originX: obj.originX, originY: obj.originY
    }

    // 2. TIME TRAVEL: Revert to the original state
    obj.set(originalState)
    obj.setCoords()

    removeObjectFromStable(canvas, obj, quadtree)

    obj.set(newState)
    obj.setCoords()

    updateQuadTree(obj)

    stampObjectToStable(canvas, obj)
  }


  return {
    init,
    getObjectsById,
    getObjectById,
    updateVisibility,
    updateQuadTree,
    getVisibleObjects,
    setVisibleObjectsState,
    query,
    getStableCanvas
  }
})