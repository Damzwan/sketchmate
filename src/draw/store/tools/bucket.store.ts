import { FabricEvent, ToolService } from '@/draw/types/draw.types'
import { defineStore, storeToRefs } from 'pinia'
import { isMobile } from '@/helper/general.helper'
import { Canvas } from 'fabric'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { bucketFill } from '@/draw/helpers/tools/bucket.helper'
import { useGestureStore } from '@/draw/store/tools/gesture.store'

export const useBucket = defineStore('bucket', (): ToolService => {
  let c: Canvas | undefined = undefined
  let gestureStart = false
  let fillInProgress = false
  const { isGesturing } = storeToRefs(useGestureStore())

  const events: FabricEvent[] = [
    {
      on: 'mouse:up',
      handler: async (o: any) => {
        if (isGesturing.value) {
          return
        }
        if (fillInProgress) return
        if (!isMobile() && o.e.button !== 0) return

        const dpr = window.devicePixelRatio || 1

        // ── Pixel sampling ─────────────────────────────────────────────────
        // getViewportPoint returns screen/CSS coordinates (same as color picker).
        // getImageData needs physical pixels → multiply by dpr.
        const screenPoint = c!.getViewportPoint(o.e)
        const ctx = c!.getContext()
        const [r, g, b, a] = ctx.getImageData(
          Math.round(screenPoint.x * dpr),
          Math.round(screenPoint.y * dpr),
          1, 1
        ).data

        const hex =
          '#' + ((1 << 24) | (r << 16) | (g << 8) | b)
            .toString(16).slice(1).toUpperCase()
          + a.toString(16).toUpperCase().padStart(2, '0')

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

        console.log('[BucketStore] click', {
          screenPoint,
          worldPoint,
          sampledHex: hex,
          backgroundColor: c!.backgroundColor,
          isBackground,
          zoom
        })

        // ── Run fill ──────────────────────────────────────────────────────
        fillInProgress = true
        try {
          const img = await bucketFill(c!, worldPoint, isBackground ? 0.5 : 1)
          if (!img) return

          if (isBackground) {
            // Insert behind the lowest intersecting object so the fill acts
            // as a background layer rather than painting on top of strokes.
            const { getVisibleObjects } = useDrawObjectManager()
            const visibleObjects = getVisibleObjects()
            const canvasObjects = c!.getObjects()

            const intersectingIds = new Set(
              visibleObjects
                .filter(obj => !obj.isBucketFill && img.intersectsWithObject(obj))
                .map(obj => obj.id)
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
          fillInProgress = false
        }
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

  return { select, init, events }
})