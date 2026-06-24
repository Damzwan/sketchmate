// src/draw/helpers/tools/eraser.helper.ts
import type { FabricObject } from 'fabric'

/**
 * Decide whether an object has been erased to the point of being effectively
 * invisible after its clipPath is applied.
 *
 * The dominant cost here is `toCanvasElement()` — a full rasterization of the
 * object (and its growing ClippingGroup). For a large object that render can be
 * 10–30ms. When the eraser passes over many objects, paying that per object is
 * what freezes the thread.
 *
 * TWO-TIER STRATEGY (the optimization):
 *   Most objects an eraser passes over are only PARTIALLY erased — a corner
 *   clipped, the bulk intact. Those are the common case and we want to reject
 *   them cheaply.
 *
 *   A downscaled render can only LOSE coverage, never gain it: a downsampled
 *   pixel's alpha is the average of its source pixels, so avg ≥ threshold
 *   implies at least one source pixel ≥ threshold. Therefore:
 *
 *     "survives at LOW resolution" ⟹ "definitely has real content" ⟹ KEEP.
 *
 *   This is reliable in the safe direction: low-res can only ever tell us to
 *   KEEP, never to delete. So for large objects we do a cheap low-res pass
 *   first; if it already finds enough survivors we return early without the
 *   expensive full render. Only objects that look gone at low-res fall through
 *   to the authoritative full-res pass (which correctly handles thin strokes
 *   that antialias away when downscaled — exactly the false-positive case the
 *   previous comment warned about, now confined to the confirm pass).
 *
 *   Small objects skip the low-res pass entirely — their full render is already
 *   cheap, so a second render would only add overhead.
 *
 * The authoritative full-res pass is unchanged in behavior:
 *   - Per-object multiplier: 1.0 for small objects, scaled down only when the
 *     natural pixel area exceeds the budget, with a floor so thin strokes keep
 *     ≥2px of width and don't antialias to nothing.
 *   - Threshold is a fraction of rendered area, not an absolute count.
 *   - Fast-exits as soon as enough surviving pixels are found.
 *   - Any render/readback failure returns false (never delete on uncertainty).
 */
export const isCompletelyErased = (
  obj: FabricObject,
  options?: {
    /** Pixels with alpha < this are treated as invisible. 0–255. */
    alphaThreshold?: number;
    /**
     * Maximum fraction of rendered area allowed to be "alive" before the
     * object is considered NOT completely erased. e.g. 0.001 = 0.1%.
     */
    survivalRatioThreshold?: number;
    /**
     * Absolute minimum surviving pixel count regardless of ratio. Keeps tiny
     * thumbnails (e.g. 32x32) from being deleted on a couple of stray pixels.
     */
    absoluteMinSurvivors?: number;
    /**
     * Maximum render area (in pixels) we'll allocate. If the object would
     * exceed this, we downscale uniformly. Default ~1MP (4 MB RGBA buffer).
     */
    maxRenderPixels?: number;
  }
): boolean => {
  const alphaThreshold = options?.alphaThreshold ?? 15
  const survivalRatioThreshold = options?.survivalRatioThreshold ?? 0.001
  const absoluteMinSurvivors = options?.absoluteMinSurvivors ?? 20
  const maxRenderPixels = options?.maxRenderPixels ?? 1_048_576

  // Only run a low-res reject pass when the full render would be big enough
  // for it to pay off (a second tiny render on a small object is pure waste).
  const LOWRES_GATE_PX = 65_536 // ~256x256
  const TARGET_LOWRES_PX = 16_384 // ~128x128

  // --- pick the authoritative (high-res) multiplier from the bounding box ---
  let multiplier = 1
  let bw = 0
  let bh = 0
  try {
    // @ts-ignore — fabric's getBoundingRect typings
    const b = (obj as any).getBoundingRect(true, true)
    bw = b.width
    bh = b.height
    const area = Math.max(1, bw * bh)
    if (area > maxRenderPixels) {
      multiplier = Math.sqrt(maxRenderPixels / area)
    }
    // Avoid sub-pixel rendering on objects with absurd aspect ratios — long
    // thin strokes need at least 1px of width to survive antialiasing.
    const minDim = Math.min(bw, bh) * multiplier
    if (minDim < 2 && minDim > 0) {
      multiplier = Math.min(1, 2 / Math.min(bw, bh))
    }
  } catch {
    multiplier = 1
  }

  // Estimated full-res render area + survival threshold. Using the estimate
  // (rather than the post-render dims) keeps the low-res and high-res passes
  // on the SAME threshold, which is what makes the low-res KEEP guarantee
  // hold. It's within a pixel or two of the real rendered size.
  const estRenderArea = Math.max(1, bw * multiplier * (bh * multiplier))
  const survivalThreshold = Math.max(
    absoluteMinSurvivors,
    Math.ceil(estRenderArea * survivalRatioThreshold)
  )

  // --- tier 1: cheap low-res reject (large objects only) -------------------
  if (estRenderArea > LOWRES_GATE_PX) {
    let lowMult = multiplier * Math.sqrt(TARGET_LOWRES_PX / estRenderArea)
    if (!isFinite(lowMult) || lowMult <= 0) lowMult = multiplier
    lowMult = Math.min(lowMult, multiplier)

    const lowSurvivors = countSurvivors(
      obj,
      lowMult,
      alphaThreshold,
      survivalThreshold
    )
    // Reaching the threshold at low-res guarantees ≥ that many real pixels at
    // full-res, so the object is definitely alive — keep it, cheaply.
    if (lowSurvivors !== null && lowSurvivors >= survivalThreshold) {
      return false
    }
    // Inconclusive (looked gone, or render failed) — fall through to the
    // authoritative pass below. We do NOT delete on the low-res result.
  }

  // --- tier 2: authoritative full-res pass ---------------------------------
  const survivors = countSurvivors(
    obj,
    multiplier,
    alphaThreshold,
    survivalThreshold
  )
  if (survivors === null) return false // couldn't render — don't delete
  return survivors < survivalThreshold
}

/**
 * Render the object at `multiplier` and count pixels with alpha >= threshold,
 * early-exiting once `cap` survivors are seen.
 *
 * Returns:
 *   - the survivor count (clamped at `cap`),
 *   - 0 for a zero-area render (nothing to see → treated as erased upstream),
 *   - null if the object couldn't be rendered/read (caller must NOT delete).
 */
function countSurvivors(
  obj: FabricObject,
  multiplier: number,
  alphaThreshold: number,
  cap: number
): number | null {
  let canvasEl: HTMLCanvasElement
  try {
    // @ts-ignore — toCanvasElement exists on FabricObject
    canvasEl = obj.toCanvasElement({ multiplier })
  } catch {
    return null
  }

  const w = canvasEl.width
  const h = canvasEl.height
  if (w === 0 || h === 0) return 0

  const ctx = canvasEl.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, w, h).data
  } catch {
    return null
  }

  let visible = 0
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] >= alphaThreshold) {
      visible++
      if (visible >= cap) return visible
    }
  }
  return visible
}


const worker = new Worker(new URL('../../workers/eraser.worker.ts', import.meta.url), {
  type: 'module'
})

export async function analyzeErasureInWorker(obj: FabricObject): Promise<boolean> {
  return new Promise((resolve) => {
    const objectJSON = obj.toJSON()
    const b = (obj as any).getBoundingRect(true, true)

    worker.onmessage = (e) => {
      if (e.data.error) {
        console.error('Erasure Worker Error:', e.data.error)
        return resolve(false)
      }

      resolve(e.data.survivors < 20)
    }

    worker.postMessage({
      object: objectJSON,
      width: b.width,
      height: b.height,
      multiplier: 0.5
    })
  })
}