import { defineStore } from 'pinia'
import { Canvas, FabricObject, util } from 'fabric'
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
        scheduleInvalidation(obj) // 👈 Batched
      }
    },
    {
      on: 'object:removed',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        if (!obj.id) return

        scheduleInvalidation(obj)

        objectMap.delete(obj.id)
        removeFromQuadTree(obj)
      }
    },
    {
      on: 'object:modified',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        const transform = e.transform

        // 1. Sync the QuadTree for the NEW position
        if (obj.type == ObjectType.selection) {
          c!.getActiveObjects().forEach(o => updateQuadTree(o))
        } else {
          updateQuadTree(obj)
        }

        if (transform?.original) {
          // 🚀 THE O(1) OLD RECT CALCULATION (No deep cloning!)
          // Save current math state
          const currentState = {
            left: obj.left, top: obj.top,
            scaleX: obj.scaleX, scaleY: obj.scaleY,
            skewX: obj.skewX, skewY: obj.skewY,
            angle: obj.angle,
            flipX: obj.flipX, flipY: obj.flipY,
            originX: obj.originX, originY: obj.originY
          }

          // Briefly revert to original state to measure the bounding box
          obj.set(transform.original)
          obj.setCoords()
          // @ts-ignore
          const oldBound = obj.getBoundingRect(true, true)
          const oldRect = new Rect(oldBound.left, oldBound.top, oldBound.width, oldBound.height)

          // Instantly restore current state
          obj.set(currentState)
          obj.setCoords()

          // 2. Schedule the raw coordinates of where it used to be
          scheduleRectInvalidation(oldRect)

          // 3. Schedule the object in its new position
          scheduleInvalidation(obj)
        } else {
          // If there was no transform (e.g., standard style/text change),
          // just push it to the batcher.
          scheduleInvalidation(obj)
        }
      }
    },
    {
      on: 'fullErase',
      handler: () => {
        // 🚀 FAST PATH: O(1) Canvas Wipe
        const physWidth = c!.getElement().width
        const physHeight = c!.getElement().height
        const stableCanvas = getStableCanvas(physWidth, physHeight)
        const stableCtx = stableCanvas.getContext('2d')!

        stableCtx.save()
        stableCtx.setTransform(1, 0, 0, 1, 0, 0)
        stableCtx.clearRect(0, 0, physWidth, physHeight)

        if (c!.backgroundColor) {
          stableCtx.fillStyle = c!.backgroundColor as string
          stableCtx.fillRect(0, 0, physWidth, physHeight)
        }
        stableCtx.restore()
        c!.requestRenderAll()
      }
    },
    {
      on: 'textStyleChanged',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
    },
    {
      on: 'objectStyleChanged',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
    },
    {
      on: 'imgFilterChanged',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
    },
    {
      on: 'flip',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
    },
    {
      on: 'layer:changed',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
    },
    {
      on: 'erasing:end',
      handler: (e: any) => scheduleInvalidation(Array.isArray(e.detail.targets) ? e.detail.targets : [e.detail.targets])
    },
    {
      on: 'backgroundColorChanged',
      handler: (e: any) => {
        const physWidth = c!.getElement().width
        const physHeight = c!.getElement().height

        // 1. Update the stable background buffer
        const stableCanvas = getStableCanvas(physWidth, physHeight)
        const stableCtx = stableCanvas.getContext('2d')!

        // Wipe the whole thing and refill with the new global color
        stableCtx.save()
        stableCtx.setTransform(1, 0, 0, 1, 0, 0)
        stableCtx.clearRect(0, 0, physWidth, physHeight)
        if (e.color) {
          stableCtx.fillStyle = e.color
          stableCtx.fillRect(0, 0, physWidth, physHeight)
        }
        stableCtx.restore()
        updateVisibility()
      }
    },
    {
      on: 'invalidateCanvas',
      handler: (e: any) => {
        scheduleInvalidation(Array.isArray(e.target) ? e.target : [e.target])
      }
    },
    {
      on: 'render:patchModifiedObject',
      handler: (e: any) => {
        const obj = e.target as FabricObject
        const oldRect = e.oldRect as Rect

        if (!obj || !oldRect) return
        updateQuadTree(obj)
        scheduleRectInvalidation(oldRect)
        scheduleInvalidation(obj)
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

    const dpr = canvas.getRetinaScaling ? canvas.getRetinaScaling() : (window.devicePixelRatio || 1)
    workingCtx.clearRect(0, 0, workingCanvas.width, workingCanvas.height)
    if (frozenBg) {
      workingCtx.fillStyle = frozenBg as string
      workingCtx.fillRect(0, 0, workingCanvas.width, workingCanvas.height)
    }

    workingCtx.save()
    workingCtx.setTransform(1, 0, 0, 1, 0, 0)

    workingCtx.scale(dpr, dpr)
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

      commitToMainScreen(canvas)
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

  function isObjectInViewport(canvas: Canvas, obj: FabricObject): boolean {
    const vptRect = getViewportRect(canvas)
    // Get absolute bounding box of the object
    // @ts-ignore
    const b = obj.getBoundingRect(true, true)

    // Standard AABB (Axis-Aligned Bounding Box) intersection test
    return !(
      b.left > vptRect.x + vptRect.w ||
      b.left + b.width < vptRect.x ||
      b.top > vptRect.y + vptRect.h ||
      b.top + b.height < vptRect.y
    )
  }

  function isRectInViewport(canvas: Canvas, r: Rect): boolean {
    const vptRect = getViewportRect(canvas)
    return !(
      r.x > vptRect.x + vptRect.w ||
      r.x + r.w < vptRect.x ||
      r.y > vptRect.y + vptRect.h ||
      r.y + r.h < vptRect.y
    )
  }

  function invalidateRegion(canvas: Canvas, objects: FabricObject[], rects: Rect[] = []) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let anyVisible = false

    // 1. Add raw Rect boundaries (from Undo/Redo old spots)
    for (const r of rects) {
      if (!isRectInViewport(canvas, r)) continue
      anyVisible = true
      minX = Math.min(minX, r.x)
      maxX = Math.max(maxX, r.x + r.w)
      minY = Math.min(minY, r.y)
      maxY = Math.max(maxY, r.y + r.h)
    }

    // 2. Add FabricObject boundaries (from new spots)
    for (const obj of objects) {
      updateQuadTree(obj)
      if (!isObjectInViewport(canvas, obj)) continue

      anyVisible = true
      // @ts-ignore
      const b = obj.getBoundingRect(true, true)
      minX = Math.min(minX, b.left)
      maxX = Math.max(maxX, b.left + b.width)
      minY = Math.min(minY, b.top)
      maxY = Math.max(maxY, b.top + b.height)
    }

    if (!anyVisible) return

    const padding = 20 // Generous buffer for visual styles
    const x = minX - padding
    const y = minY - padding
    const w = (maxX - minX) + padding * 2
    const h = (maxY - minY) + padding * 2

    const physWidth = canvas.getElement().width
    const physHeight = canvas.getElement().height
    const stableCanvas = getStableCanvas(physWidth, physHeight)
    const stableCtx = stableCanvas.getContext('2d')!
    const vpt = canvas.viewportTransform!
    const dpr = canvas.getRetinaScaling ? canvas.getRetinaScaling() : (window.devicePixelRatio || 1)

    stableCtx.save()
    stableCtx.setTransform(1, 0, 0, 1, 0, 0)
    stableCtx.scale(dpr, dpr)
    stableCtx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5])

    // 2. Punch the union hole
    stableCtx.clearRect(x, y, w, h)
    if (canvas.backgroundColor) {
      stableCtx.fillStyle = canvas.backgroundColor as string
      stableCtx.fillRect(x, y, w, h)
    }

    stableCtx.beginPath()
    stableCtx.rect(x, y, w, h)
    stableCtx.clip()

    // 3. Query all intersecting objects
    const queryRect = new Rect(x, y, w, h)
    const neighbors = query(queryRect)

    // 4. CRITICAL: Sort by internal Fabric Z-Index
    const canvasObjects = canvas.getObjects()
    neighbors.sort((a, b) => canvasObjects.indexOf(a) - canvasObjects.indexOf(b))

    // 5. Redraw perfectly in order
    for (const neighbor of neighbors) {
      if (neighbor.visible !== false) {
        neighbor.render(stableCtx as CanvasRenderingContext2D)
      }
    }

    stableCtx.restore()
  }

  const dirtyObjects = new Set<FabricObject>()
  const dirtyRects = new Set<Rect>() // 👈 NEW: Accepts raw coordinates
  let isBatchScheduled = false

  function scheduleInvalidation(target: FabricObject | FabricObject[]) {
    const gestureStore = useGestureStore()
    if (gestureStore.isGesturing) return

    const objects = Array.isArray(target) ? target : [target]
    objects.forEach(o => dirtyObjects.add(o))
    triggerBatch()
  }

  function scheduleRectInvalidation(rect: Rect) {
    const gestureStore = useGestureStore()
    if (gestureStore.isGesturing) return

    dirtyRects.add(rect)
    triggerBatch()
  }

  function triggerBatch() {
    if (isBatchScheduled) return
    isBatchScheduled = true

    queueMicrotask(() => {
      isBatchScheduled = false
      const gestureStore = useGestureStore()

      if (gestureStore.isGesturing) {
        dirtyObjects.clear()
        dirtyRects.clear()
        return
      }

      const batchObjects = Array.from(dirtyObjects)
      const batchRects = Array.from(dirtyRects)

      dirtyObjects.clear()
      dirtyRects.clear()

      if (batchObjects.length === 0 && batchRects.length === 0) return

      if (batchObjects.length + batchRects.length > 50) {
        updateVisibility(false) // Full-screen chunk fallback
        return
      }

      invalidateRegion(c!, batchObjects, batchRects) // Pass both to the patcher
      commitToMainScreen(c!)
    })
  }

  function commitToMainScreen(canvas: Canvas) {
    const gestureStore = useGestureStore()
    // If the user is actively panning/zooming, fastBlit handles the screen
    if (gestureStore.isGesturing) return

    const mainCtx = canvas.getContext()
    const physWidth = canvas.getElement().width
    const physHeight = canvas.getElement().height
    const stableCanvas = getStableCanvas(physWidth, physHeight)
    const targetVpt = [...canvas.viewportTransform!] as number[]
    const activeObjects = canvas.getActiveObjects()
    const dpr = canvas.getRetinaScaling ? canvas.getRetinaScaling() : (window.devicePixelRatio || 1)

    // 1. Wipe the DOM Canvas and paste the pre-rendered background
    mainCtx.save()
    mainCtx.setTransform(1, 0, 0, 1, 0, 0)
    mainCtx.scale(dpr, dpr)
    mainCtx.clearRect(0, 0, physWidth, physHeight)
    // Use 9-argument drawImage to ensure crisp Retina mapping
    mainCtx.drawImage(
      stableCanvas as CanvasImageSource,
      0, 0, physWidth, physHeight,
      0, 0, canvas.width!, canvas.height!
    )
    mainCtx.restore()

    // 2. Render active objects (like selection handles or the active pen brush) cleanly ON TOP
    if (activeObjects.length > 0) {
      mainCtx.save()
      mainCtx.transform(
        targetVpt[0], targetVpt[1], targetVpt[2],
        targetVpt[3], targetVpt[4], targetVpt[5]
      )
      for (const activeObj of activeObjects) {
        activeObj.render(mainCtx)
      }
      mainCtx.restore()
    }

    // 3. Draw Fabric UI controls
    // @ts-ignore
    if (!canvas.skipControlsDrawing) canvas.drawControls(mainCtx)

    canvas.fire('after:render', { ctx: mainCtx })
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