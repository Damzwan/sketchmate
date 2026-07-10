import { Canvas, FabricObject, Path } from 'fabric'
import { ref, type Ref, watch } from 'vue'
import { EraserSize, FabricEvent, ToolService } from '@/draw/types/draw.types'
import { defineStore } from 'pinia'
import { CustomEraserBrush } from '@/draw/utils/brushes/CustomEraserBrush'
import { isMobile } from '@/helper/general.helper'
import { updateFreeDrawingCursor } from '@/draw/helpers/tools/cursor.helper'
import { v4 } from 'uuid'
import { analyzeErasureInWorker } from '@/draw/helpers/tools/eraser.helper'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useAuthStore } from '@/store/auth.store'
import { useClaimArea } from '@/draw/store/claimArea.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { createYielder } from '@/draw/helpers/yielding.helper'
import { isActive as transformSessionActive } from '@/draw/transform/transformController'

interface Eraser extends ToolService {
  eraserSize: Ref<number>;
  cancelErase: () => void;
}

interface CleanupJob {
  targets: FabricObject[];
  cursor: number;
  deleted: FabricObject[];
  path: Path;
}


interface CoverageEntry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  bboxLeft: number;
  bboxTop: number;
  sx: number;
  sy: number;
  matrixKey: string;
  pixels: number;
}

const COVERAGE_MAX_DIM = 96
const COVERAGE_ALPHA = 15 // alpha >= this counts as "still there"
// Each entry holds a canvas (~36KB backing store at 96x96). iOS Safari has a
// hard total-canvas-memory budget, and 3000 live canvases was enough to blow
// it during long erase sessions. 256 covers any realistic stroke burst; the
// cache is a pure perf hint, so eviction only costs a rebuild on next touch.
const COVERAGE_MAX_ENTRIES = 256

function matrixKey(obj: FabricObject): string {
  try {
    return obj
      .calcTransformMatrix()
      .map((n) => n.toFixed(2))
      .join(',')
  } catch {
    return ''
  }
}

const IS_MOBILE = isMobile()

export const useEraser = defineStore('eraser', (): Eraser => {
  let c: Canvas | undefined = undefined
  const objMgr = useDrawObjectManager()

  const eraserSize = ref<EraserSize>(EraserSize.small)
  let isCancelling = false
  let cancelCircle = false
  // One brush per canvas, reused across tool selections. Each brush owns a
  // full-screen retina effect canvas; constructing a fresh one per select()
  // stacked those canvases until GC — real memory pressure on iOS.
  let brush: CustomEraserBrush | null = null

  const cleanupQueue: CleanupJob[] = []
  let draining = false
  const coverage = new Map<string, CoverageEntry>()

  function objectStillPresent(obj: FabricObject): boolean {
    return !!obj?.id && objMgr.getObjectById(obj.id) === obj
  }

  function forgetCoverage(id?: string) {
    if (!id) return
    const entry = coverage.get(id)
    if (entry) {
      // Zero the dims so the backing store is released NOW, not at next GC —
      // iOS counts canvas memory the moment it's allocated.
      entry.canvas.width = 0
      entry.canvas.height = 0
      coverage.delete(id)
    }
  }

  /**
   * Get (or lazily build) the low-res "remaining content" bitmap for an
   * object. Rebuilds if the object has been transformed since capture.
   * Returns null if it can't be rendered — caller treats that as "uncertain".
   */
  function ensureCoverage(obj: FabricObject): CoverageEntry | null {
    const id = obj.id as string | undefined
    if (!id) return null

    const existing = coverage.get(id)
    if (existing && existing.matrixKey === matrixKey(obj)) return existing

    try {
      const bbox = (obj as any).getBoundingRect(true, true)
      if (!bbox.width || !bbox.height) return null

      const mult = Math.min(
        1,
        COVERAGE_MAX_DIM / Math.max(bbox.width, bbox.height)
      )
      // Current clipped state — i.e. what survives RIGHT NOW, history included.
      const fp: HTMLCanvasElement = (obj as any).toCanvasElement({
        multiplier: mult
      })
      const ctx = fp.getContext('2d', { willReadFrequently: true })
      if (!ctx || !fp.width || !fp.height) return null

      // Stale rebuild replaces the old canvas — release it explicitly.
      if (existing) forgetCoverage(id)
      // FIFO eviction (Map preserves insertion order) instead of clear-all.
      while (coverage.size >= COVERAGE_MAX_ENTRIES) {
        const oldest = coverage.keys().next().value
        if (oldest === undefined) break
        forgetCoverage(oldest)
      }

      const entry: CoverageEntry = {
        canvas: fp,
        ctx,
        bboxLeft: bbox.left,
        bboxTop: bbox.top,
        sx: fp.width / bbox.width,
        sy: fp.height / bbox.height,
        matrixKey: matrixKey(obj),
        pixels: fp.width * fp.height
      }
      coverage.set(id, entry)
      return entry
    } catch {
      forgetCoverage(id)
      return null
    }
  }

  /**
   * Punch the new eraser stroke into the remaining-content bitmap. The path is
   * in scene/world coords (it has not been sent to any object's plane — only
   * the per-object CLONES are), and the bitmap maps world -> pixels via the
   * object's world bounding box, so the placement is plane-agnostic.
   */
  function stampCoverage(entry: CoverageEntry, path: Path): boolean {
    // Only plain (destination-out) erasing maps cleanly to "remove coverage".
    // Inverted / undo strokes add content back — punt those to the
    // authoritative check.
    if ((path as any).globalCompositeOperation !== 'destination-out') {
      return false
    }
    try {
      const ctx = entry.ctx
      ctx.save()
      ctx.setTransform(
        entry.sx,
        0,
        0,
        entry.sy,
        -entry.bboxLeft * entry.sx,
        -entry.bboxTop * entry.sy
      );
      // Path carries its own destination-out gco, so render() punches a hole.
      (path as any).render(ctx)
      ctx.restore()
      return true
    } catch {
      return false
    }
  }

  /**
   * @returns true if the bitmap CONFIDENTLY still holds content (=> skip the
   * expensive check). false means "looks nearly empty — confirm it".
   */
  function coverageSaysPresent(entry: CoverageEntry): boolean {
    try {
      const { width, height } = entry.canvas
      const data = entry.ctx.getImageData(0, 0, width, height).data
      const floor = Math.max(12, Math.floor(entry.pixels * 0.005)) // 0.5%
      let count = 0
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] >= COVERAGE_ALPHA) {
          count++
          if (count >= floor) return true
        }
      }
      return false
    } catch {
      return false // tainted / failed read -> confirm authoritatively
    }
  }

  function enqueueErasedCheck(targets: FabricObject[], path: Path) {
    if (!targets.length) return
    cleanupQueue.push({
      targets: targets.slice(),
      cursor: 0,
      deleted: [],
      path
    })
    scheduleDrain()
  }

  /** Start the drain in IDLE time — the per-object work (toCanvasElement /
   *  toJSON) is chunky and used to land right after the stroke commit, on top
   *  of the tile rebake. */
  function scheduleDrain() {
    if (draining) return
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined
    if (ric) ric(() => void drainCleanup(), { timeout: 2000 })
    else setTimeout(() => void drainCleanup(), 200)
  }

  function idlePause(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 250))
  }

  async function drainCleanup() {
    if (draining) return
    draining = true

    const yielder = createYielder({ budgetMs: 8 })

    try {
      while (cleanupQueue.length > 0) {
        if (!c) {
          cleanupQueue.length = 0
          return
        }
        const job = cleanupQueue[0]
        while (job.cursor < job.targets.length) {
          await yielder.maybeYield()
          // A drag/scale session owns the frame budget — back off until it
          // commits so a big-object render can't hitch the interaction.
          while (transformSessionActive()) await idlePause()
          if (!c) {
            cleanupQueue.length = 0
            return
          }
          const obj = job.targets[job.cursor++]
          if (!objectStillPresent(obj)) {
            forgetCoverage(obj?.id as string)
            continue
          }

          // --- cheap gate: update the remaining-content bitmap ---------
          let confirm = true // default: run the authoritative check
          const entry = ensureCoverage(obj)
          if (entry) {
            stampCoverage(entry, job.path)
            // If content is confidently still there, skip the costly check.
            if (coverageSaysPresent(entry)) confirm = false
          }
          if (!confirm) continue

          // --- authoritative confirm (rare) ---------------------------
          try {
            const shouldErase = await analyzeErasureInWorker(obj)
            if (shouldErase) job.deleted.push(obj)
          } catch {
            // Never delete on uncertainty.
          }
        }
        cleanupQueue.shift()
        finalizeCleanup(job)
      }
    } finally {
      draining = false
      if (cleanupQueue.length > 0) scheduleDrain()
    }
  }

  function finalizeCleanup(job: CleanupJob) {
    if (!c) return
    const strokeId = (job.path as any).id
    const removable = job.deleted.filter(objectStillPresent).filter((obj) => {
      // The check runs deferred — an undo may have pulled this stroke out of
      // the object's clip in the meantime. Deleting then would vanish a
      // visible object AND the erase action is no longer in the undo stack,
      // so nothing could restore it. Only delete while THIS stroke still
      // erases the object. (A flattened clip loses stroke ids — that also
      // lands here and safely keeps the object.)
      const clip: any = obj.clipPath
      return !!clip?._objects?.some((o: any) => o?.id === strokeId)
    })
    if (!removable.length) return

    // Record stack positions BEFORE removing anything, so erase-undo can
    // restore each object at its original z instead of dropping it on top.
    // All indexes are captured against the same full stack, so ascending
    // re-insertion reproduces them exactly.
    const stack = c.getObjects()
    for (const obj of removable) {
      (obj as any).insertedIndex = stack.indexOf(obj)
    }

    for (const obj of removable) {
      forgetCoverage(obj.id as string)
      c.remove(obj)
    }

    c.fire('erasing:cleanup_done', {
      strokeId,
      deletedObjects: removable
    } as any)
  }

  const events: FabricEvent[] = [
    {
      on: 'zoomChanged',
      handler: updateEraserCursor
    },
    {
      on: 'mouse:move',
      handler: (e: any) => {
        if (!IS_MOBILE || cancelCircle) return

        const ctx = c!.contextTop

        c!.clearContext(ctx)

        const pointer = e.viewportPoint

        ctx.beginPath()
        ctx.arc(
          pointer.x,
          pointer.y,
          (eraserSize.value * c!.getZoom()) / 2,
          0,
          2 * Math.PI
        )

        ctx.strokeStyle = 'lightblue'
        const og = ctx.lineWidth
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.lineWidth = og
      }
    },
    {
      on: 'zoomReset',
      handler: (e: any) => {
        updateEraserCursor()
      }
    },
    {
      on: 'gestureStart',
      handler: (e: any) => {
        cancelCircle = true
      }
    },
    {
      on: 'mouse:up',
      handler: (e: any) => {
        cancelCircle = false
        // Backstop: guarantee compositing resumes even if a stroke was
        // cancelled or 'start' was prevented (so the flag can't stick).
        objMgr.setErasing(false)
      }
    }
  ]

  function init(canvas: Canvas) {
    // Fresh canvas → the old brush (and its full-screen effect canvas) is
    // dead weight. Release it now instead of holding it until next select().
    if (brush && brush.canvas !== canvas) {
      brush.dispose()
      brush = null
    }
    c = canvas
  }

  function updateEraserCursor() {
    updateFreeDrawingCursor(
      c!,
      eraserSize.value,
      c!.backgroundColor as string,
      true
    )
  }

  function cancelErase() {
    if (!c) return
    const brush = c.freeDrawingBrush as CustomEraserBrush
    if (!brush) return
    brush.cancel()
    objMgr.setErasing(false) // resume compositing after a hard cancel
  }

  async function select() {
    c!.isDrawingMode = true
    c!.selection = false
    c!.skipTargetFind = true

    if (brush && brush.canvas === c) {
      // Reuse: providers + handlers already attached. Only the dims may be
      // stale (rotation / keyboard resize since last use).
      brush.syncDimensions()
      brush.width = eraserSize.value
      c!.freeDrawingBrush = brush
      updateEraserCursor()
      return
    }

    brush?.dispose() // canvas changed — release the old effect canvas now
    const b = new CustomEraserBrush(c!)
    brush = b

    b.width = eraserSize.value

    // Restrict the (expensive) selective-erase mask render to on-screen
    // objects, returned in paint (z) order. Off-viewport objects can never
    // contribute a visible pixel to a screen-space mask, so this is correct
    // and avoids a full native re-render of every object on mousedown.
    b.protectObjectsProvider = () => {
      const objs = objMgr.getVisibleObjects()
      const z = objMgr.getZIndexMap()
      return objs.sort((a, b2) => (z.get(a) ?? 0) - (z.get(b2) ?? 0))
    }

    // Resolve eraser targets through the spatial index instead of scanning
    // every object. walk() still runs the precise intersection test, so a
    // padded over-query is safe. Assumes targets are indexed (have ids) —
    // which they are for everything synced through drawObjectManager.
    b.targetCandidatesProvider = (path: Path) => {
      const r = (path as any).getBoundingRect(true, true)
      const pad = (path as any).strokeWidth ?? 0
      return objMgr.query({
        x: r.left - pad,
        y: r.top - pad,
        w: r.width + 2 * pad,
        h: r.height + 2 * pad
      })
    }

    // Stroke begins: the brush now owns the canvas's lower context (it
    // post-composites destination-out after each render). Suspend the tile
    // compositor for the stroke so the two don't race and flicker.
    b.on('start', () => {
      objMgr.setErasing(true)
    })

    // Stroke ended without a usable path (<2 points): resume immediately.
    b.on('cancel', () => {
      objMgr.setErasing(false)
    })

    b.on('end', async (e: any) => {
      // Resume compositing FIRST, so the erasing:end → onErase rect patch
      // and rebake below can actually run (requestFrame is suppressed while
      // erasing). Idempotent with the mouse:up backstop.
      objMgr.setErasing(false)

      e.detail.path.id = v4()

      if (isCancelling) {
        isCancelling = false
        await b.commit(e.detail)
        return
      }

      // 1. FILTER TARGETS FIRST: Remove objects belonging to other users
      const { isPublicLobby } = useDrawSyncer()
      if (isPublicLobby) {
        const { user } = useAuthStore()
        e.detail.targets = (e.detail.targets || []).filter(
          (o: FabricObject) => o.userId === user?._id
        )
      }

      // Also protect anything inside another user's claimed area (applies to
      // private online lobbies too, where the ownership filter above doesn't).
      const claim = useClaimArea()
      if (claim.foreignAreas.length > 0) {
        e.detail.targets = (e.detail.targets || []).filter(
          (o: FabricObject) => !claim.isObjectProtected(o)
        )
      }

      await b.commit(e.detail)

      const targets: FabricObject[] = e.detail.targets || []

      e.detail.deletedObjects = []
      e.detail.selective = isPublicLobby
      c!.fire('erasing:end', e as any)

      enqueueErasedCheck(targets, e.detail.path)
    })

    b.on('redraw', (e: any) => {
      // The initial drawEffect on mousedown already produced the mask.
      // We don't need to redo it after every render.
      if (e.detail.type === 'render') e.preventDefault()
    })

    c!.freeDrawingBrush = b
    updateEraserCursor()
  }

  watch(eraserSize, () => {
    c!.freeDrawingBrush!.width = eraserSize.value
    updateEraserCursor()
  })

  return { init, select, eraserSize, events, cancelErase }
})
