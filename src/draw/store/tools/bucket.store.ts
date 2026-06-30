import { FabricEvent, ToolService } from '@/draw/types/draw.types'
import { defineStore } from 'pinia'
import { isMobile } from '@/helper/general.helper'
import { Canvas } from 'fabric'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { bucketFill } from '@/draw/helpers/tools/bucket.helper'
import { Ref, ref } from 'vue'

interface Bucket extends ToolService {
  isFilling: Ref<boolean>;
}

export const useBucket = defineStore('bucket', (): Bucket => {
  let c: Canvas | undefined = undefined
  let gestureStart = false
  let fillInProgress = false
  const isFilling = ref(false)

  const events: FabricEvent[] = [
    {
      on: 'mouse:up',
      handler: async (o: any) => {
        if (gestureStart && isMobile()) {
          gestureStart = false
          return
        }
        if (fillInProgress) return
        if (!isMobile() && o.e.button !== 0) return

        const dpr = window.devicePixelRatio || 1

        const screenPoint = c!.getViewportPoint(o.e)
        const ctx = c!.getContext()
        const [r, g, b, a] = ctx.getImageData(
          Math.round(screenPoint.x * dpr),
          Math.round(screenPoint.y * dpr),
          1,
          1
        ).data

        const hex =
          '#' +
          ((1 << 24) | (r << 16) | (g << 8) | b)
            .toString(16)
            .slice(1)
            .toUpperCase() +
          a.toString(16).toUpperCase().padStart(2, '0')

        const isBackground = hex === c!.backgroundColor

        // ── World-space click for the fill algorithm ───────────────────────
        // Fabric: screenPx = worldCoord * zoom + pan
        //         worldCoord = (screenPx - pan) / zoom
        const vpt = c!.viewportTransform!
        const zoom = c!.getZoom()
        const worldPoint = {
          x: (screenPoint.x - vpt[4]) / zoom,
          y: (screenPoint.y - vpt[5]) / zoom
        }

        // ── Run fill ──────────────────────────────────────────────────────
        // Only surface the "Filling…" indicator if the fill is slow enough to
        // be worth it — short fills finish before the timer and never flash it.
        fillInProgress = true
        const spinnerTimer = setTimeout(() => {
          isFilling.value = true
        }, 220)
        try {
          const img = await bucketFill(c!, worldPoint)
          if (!img) return

          if (isBackground) {
            // Insert behind the lowest intersecting object so the fill acts
            // as a background layer rather than painting on top of strokes.
            const { getVisibleObjects } = useDrawObjectManager()
            const visibleObjects = getVisibleObjects()
            const canvasObjects = c!.getObjects()

            const intersectingIds = new Set(
              visibleObjects
                .filter(
                  (obj) => !obj.isBucketFill && img.intersectsWithObject(obj)
                )
                .map((obj) => obj.id)
            )

            // Single linear scan — stops at first hit (already in z-order)
            let lowestIndex = canvasObjects.length
            for (let i = 0; i < canvasObjects.length; i++) {
              if (intersectingIds.has(canvasObjects[i].id)) {
                lowestIndex = i
                break
              }
            }

            img.insertedIndex = lowestIndex
            c!.insertAt(lowestIndex, img)
          } else {
            c!.add(img)
          }
        } finally {
          clearTimeout(spinnerTimer)
          fillInProgress = false
          isFilling.value = false
        }
      }
    },
    {
      on: 'gestureStart',
      handler: () => {
        gestureStart = true
      }
    }
  ]

  function init(canvas: Canvas) {
    c = canvas
  }

  async function select() {
    if (!c) return
    c.isDrawingMode = false
    c.selection = false
    c.skipTargetFind = true
  }

  return { select, init, events, isFilling }
})
