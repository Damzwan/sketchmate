import { Canvas, FabricObject, util } from 'fabric'
import { useFriendStore } from '@/store/friend.store'
import { createYielder, nextFrame } from '@/draw/helpers/yielding.helper'

/**
 * Enlivens Fabric objects from JSON in time-slices to avoid main-thread blocking,
 * while filtering out objects from blocked users.
 *
 * Changes from previous version:
 *   • Uses createYielder (RAF + isInputPending) instead of yieldToMain(setTimeout 4).
 *   • Enlivens in BATCHES of ~32 with Promise.all instead of one at a time —
 *     each enliven call has microtask overhead, so doing them concurrently is
 *     much faster while still respecting the frame budget for callbacks.
 *   • Yields a full RAF when input is pending, not a fast yield, so the user's
 *     gesture is dispatched before we resume.
 */
export async function enlivenObjectsTimeSlivered(
  objectsJson: any[],
  onObjectEnlivened: (obj: FabricObject) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!objectsJson || objectsJson.length === 0) return

  const { isBlocked } = useFriendStore()
  const IS_MOBILE = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)

  // Pre-filter blocked users — saves us from enlivening then discarding.
  const filtered = objectsJson.filter(item => !isBlocked(item.userId))
  if (filtered.length === 0) return

  // Batch size: enough to amortize the enliven call overhead, small enough
  // that one batch doesn't exceed a frame. Empirically ~32 on desktop and
  // ~16 on mobile lands in the right range.
  const BATCH_SIZE = IS_MOBILE ? 16 : 32

  const yielder = createYielder({ budgetMs: IS_MOBILE ? 4 : 6, signal })
  yielder.reset()

  let i = 0
  while (i < filtered.length) {
    if (signal?.aborted) return

    const batch = filtered.slice(i, i + BATCH_SIZE)
    i += batch.length

    // Enliven the batch concurrently. Most objects enliven synchronously
    // through microtasks; images await loading. Promise.all takes the max.
    let enlivened: FabricObject[]
    try {
      enlivened = await util.enlivenObjects<FabricObject>(batch)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[enliven] batch failed at index', i - batch.length, e)
      continue
    }

    if (signal?.aborted) return

    // Re-check block status post-enliven (blocked list might have changed
    // during the async enliven call).
    for (const obj of enlivened) {
      if (obj && !isBlocked(obj.userId)) {
        try {
          onObjectEnlivened(obj)
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[enliven] onObjectEnlivened threw', e)
        }
      }
    }

    // Yield if budget exhausted OR input pending. The check is in the yielder.
    if (i < filtered.length && yielder.shouldYield()) {
      await yielder.yield()
      if (signal?.aborted) return
    }
  }
}

/**
 * Time-sliced canvas → JSON serialization.
 *
 * Each obj.toJSON() is synchronous but cheap relative to render. The hazard
 * is doing 3000 of them in a tight loop. We bucket into time-slices and yield
 * to RAF (or earlier if input is pending).
 */
export async function generateChunkedJSON(canvas: Canvas, signal?: AbortSignal) {
  const json: any = {
    version: canvas.version,
    objects: [],
    background: canvas.backgroundColor
  }
  if (canvas.clipPath) json.clipPath = canvas.clipPath.toJSON()
  if (canvas.backgroundImage) json.backgroundImage = canvas.backgroundImage.toJSON()

  const objects = canvas.getObjects()
  const IS_MOBILE = typeof navigator !== 'undefined' && /Mobi|Android/i.test(navigator.userAgent)
  const yielder = createYielder({ budgetMs: IS_MOBILE ? 4 : 6, signal })

  // Defer one frame so the caller's UI update can paint before we start.
  await nextFrame()
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

  yielder.reset()
  for (let i = 0; i < objects.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    json.objects.push(objects[i].toJSON())

    if (yielder.shouldYield()) {
      await yielder.yield()
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    }
  }
  return json
}