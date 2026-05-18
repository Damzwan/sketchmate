import { FabricObject } from 'fabric'
import { isMobile } from '@/helper/general.helper'

// ─── Level-of-Detail Rendering ────────────────────────────────────────────────
//
// Lightweight rendering optimization that reduces detail at small screen sizes
// or for tiny objects. Used in place of obj.render(ctx) in every render path.
//
// Three tiers based on screen-space size of the object's longer dimension:
//
//   1. Tiny  (< TINY_THRESHOLD_PX): draw a single filled rect. ~50× faster
//      than rendering the full path.
//   2. Small + long path: decimate the path/trace, keeping every Nth point.
//      Renders correctly via Fabric's normal path code but with fewer
//      vertices.
//   3. Full quality: passthrough to obj.render(ctx).
//
// Thresholds are more aggressive on mobile because every saved millisecond
// matters more.

const SIMPLIFY_THRESHOLD_PX = isMobile() ? 48 : 32
const SIMPLIFY_PATH_MIN = 20
const MAX_DECIMATION = 32

function screenSize(obj: FabricObject, zoom: number): number {
  const b = obj.getBoundingRect()
  return Math.max(b.width, b.height) * zoom
}

function decimationFactor(screenPx: number, pathLength: number): number {
  if (pathLength < SIMPLIFY_PATH_MIN) return 1
  if (screenPx > SIMPLIFY_THRESHOLD_PX) return 1
  const factor = Math.max(1, Math.floor(SIMPLIFY_THRESHOLD_PX / Math.max(screenPx, 1)))
  return Math.min(factor, MAX_DECIMATION)
}

function pickColor(obj: any): string {
  const stroke = obj.stroke
  if (typeof stroke === 'string' && stroke !== 'transparent') return stroke
  const fill = obj.fill
  if (typeof fill === 'string' && fill !== 'transparent') return fill
  return '#888'
}

export function renderWithLOD(
  obj: FabricObject,
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  zoom: number
): void {
  const screenPx = screenSize(obj, zoom)


  // ── Tier 1: Small + long path → decimate ────────────────────────────────
  const o = obj as any
  const trace = o.compressedTrace as any[] | undefined
  const path = o.path as any[] | undefined
  const sourceArray = trace ?? path
  if (sourceArray && sourceArray.length >= SIMPLIFY_PATH_MIN) {
    const factor = decimationFactor(screenPx, sourceArray.length)
    if (factor > 1) {
      const decimated: any[] = []
      for (let i = 0; i < sourceArray.length; i += factor) decimated.push(sourceArray[i])
      const lastIdx = sourceArray.length - 1
      if ((lastIdx % factor) !== 0) decimated.push(sourceArray[lastIdx])

      const originalKey = trace ? 'compressedTrace' : 'path'
      const original = sourceArray
      try {
        o[originalKey] = decimated
        obj.render(ctx as CanvasRenderingContext2D)
      } finally {
        o[originalKey] = original
      }
      return
    }
  }

  // ── Tier 2: Full quality ────────────────────────────────────────────────
  obj.render(ctx as CanvasRenderingContext2D)
}