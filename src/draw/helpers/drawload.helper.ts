import { util, FabricObject, Canvas } from 'fabric'
import { yieldToMain } from '@/helper/general.helper'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'

/**
 * Enlivens Fabric objects from JSON in time-slices to avoid main-thread blocking,
 * while filtering out objects from blocked users.
 */
export async function enlivenObjectsTimeSlivered(
  objectsJson: any[],
  onObjectEnlivened: (obj: FabricObject) => void
): Promise<void> {
  if (!objectsJson || objectsJson.length === 0) return

  const { isBlocked } = useDrawSyncer()
  const TIME_BUDGET_MS = 8
  let i = 0

  while (i < objectsJson.length) {
    const frameStartTime = performance.now()

    // Process as many objects as we can within the 8ms budget
    while (i < objectsJson.length && (performance.now() - frameStartTime) < TIME_BUDGET_MS) {
      const item = objectsJson[i]

      // 1. Pre-enliven Check
      // Skip the heavy parsing if the user is already blocked
      if (isBlocked(item.userId)) {
        i++
        continue
      }

      try {
        // 2. Enliven using the new Promise-based API
        // We pass the single object in an array to keep control of the loop timing
        const enlivened = await util.enlivenObjects<FabricObject>([item])
        const obj = enlivened[0]

        // 3. Post-enliven Check & Callback
        if (obj && !isBlocked(obj.userId)) {
          onObjectEnlivened(obj)
        }
      } catch (e) {
        console.error('Failed to enliven object at index', i, e)
      }

      i++
    }

    // 4. Yield to Main Thread
    // If we still have objects to process, we yield to keep the UI responsive
    if (i < objectsJson.length) {
      await yieldToMain()
    }
  }
}

export async function generateChunkedJSON(canvas: Canvas, signal?: AbortSignal) {
  const json: any = {
    version: canvas.version,
    objects: [],
    background: canvas.backgroundColor
  }
  if (canvas.clipPath) json.clipPath = canvas.clipPath.toJSON()
  if (canvas.backgroundImage) json.backgroundImage = canvas.backgroundImage.toJSON()

  const objects = canvas.getObjects()
  const TIME_BUDGET_MS = 8
  let frameStartTime = performance.now()

  for (let i = 0; i < objects.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    json.objects.push(objects[i].toJSON())

    if (performance.now() - frameStartTime > TIME_BUDGET_MS) {
      await yieldToMain()
      frameStartTime = performance.now()
    }
  }
  return json
}