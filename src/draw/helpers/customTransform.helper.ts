// ============================================================================
// 1. SHARED LAYERED RENDER PIPELINE
// ============================================================================
// These buffers act as off-screen GPUs. They are shared across all tools and
// interactions to prevent memory leaks from creating canvases repeatedly.

import { ActiveSelection, Canvas, FabricObject } from 'fabric'
import { ObjectType } from '@/draw/types/draw.types'

const backgroundBuffer = document.createElement('canvas')
const foregroundBuffer = document.createElement('canvas')
const bgCtx = backgroundBuffer.getContext('2d')!
const fgCtx = foregroundBuffer.getContext('2d')!

// Global flag to tell the render engine we are in high-performance mode
export let isLayeredRenderActive = false

/**
 * Takes a snapshot of the canvas stack, flattening everything below the target
 * into the background buffer, and everything above into the foreground buffer.
 */
function updateBufferResolution(canvas: Canvas) {
  const retina = canvas.getRetinaScaling()

  // Set the physical resolution (Retina)
  backgroundBuffer.width = foregroundBuffer.width = canvas.width! * retina
  backgroundBuffer.height = foregroundBuffer.height = canvas.height! * retina

  // Scale the context so drawing 1 unit covers 'retina' physical pixels
  bgCtx.resetTransform()
  fgCtx.resetTransform()
  bgCtx.scale(retina, retina)
  fgCtx.scale(retina, retina)
}

/**
 * Prepares snapshots by flattening the stack into background and foreground buffers.
 */
export function prepareLayeredBuffers(c: Canvas, target: FabricObject) {
  if (!c.preserveObjectStacking) return
  updateBufferResolution(c)

  if (c.viewportTransform) {
    bgCtx.transform(...c.viewportTransform)
    fgCtx.transform(...c.viewportTransform)
  }

  const allObjects = c.getObjects()

  // Create a Set for O(1) lookup
  // If target is an ActiveSelection, we want its internal objects
  const activeTargets = new Set(
    target.type === 'activeselection'
      ? (target as any)._objects
      : [target]
  )

  let reachedFirstTarget = false

  for (let i = 0; i < allObjects.length; i++) {
    const obj = allObjects[i]

    if (activeTargets.has(obj)) {
      reachedFirstTarget = true
      continue // Skip rendering active objects into either buffer
    }

    // If we haven't hit any selected objects yet, it's background.
    // If we have passed them, it's foreground.
    if (!reachedFirstTarget) {
      obj.render(bgCtx)
    } else {
      obj.render(fgCtx)
    }
  }

  isLayeredRenderActive = true
}

/**
 * Renders the composite stack back to the screen using simple, stable image calls.
 */
let hasMoved = false

export function renderLayeredBuffers(c: Canvas, movingObject: FabricObject) {
  hasMoved = true
  const ctx = c.getContext()
  const retina = c.getRetinaScaling()

  ctx.save()
  ctx.resetTransform()
  ctx.scale(retina, retina)
  ctx.clearRect(0, 0, c.width!, c.height!)

  // 1. Draw Background (Flattened)
  ctx.drawImage(backgroundBuffer, 0, 0, c.width!, c.height!)

  // 2. Draw Moving Objects (Active Selection or Single Object)
  ctx.save()
  if (c.viewportTransform) {
    ctx.transform(...c.viewportTransform)
  }
  movingObject.render(ctx)
  ctx.restore()

  // 3. Draw Foreground (Flattened)
  ctx.drawImage(foregroundBuffer, 0, 0, c.width!, c.height!)

  // 4. Controls (on the top context)
  c.clearContext(c.getTopContext())
  movingObject._renderControls(c.getTopContext())

  ctx.restore()
}

export function finalizeLayeredRender(c: Canvas) {
  if (isLayeredRenderActive && hasMoved) {
    hasMoved = false
    isLayeredRenderActive = false
    c.requestRenderAll()
  }
}
