import { FabricEvent, ToolService } from '@/draw/types/draw.types'
import { defineStore } from 'pinia'
import { isMobile } from '@/helper/general.helper'
import { Canvas } from 'fabric'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { bucketFill2 } from '@/draw/helpers/tools/bucket.helper'

export const useBucket = defineStore('bucket', (): ToolService => {
  let c: Canvas | undefined = undefined
  let gestureStart = false

  const events: FabricEvent[] = [
    {
      on: 'mouse:up',
      handler: async (o: any) => {
        if (gestureStart) {
          gestureStart = false
          return
        }
        if ((!isMobile() && o.e.button !== 0)) return // only execute button fill for left click


        const pointer = c!.getViewportPoint(o.e)
        const dpr = window.devicePixelRatio || 1
        const ctx = c!.getContext()
        const pixel = ctx.getImageData(pointer.x * dpr, pointer.y * dpr, 1, 1).data
        const hex =
          '#' +
          ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1).toUpperCase() +
          pixel[3].toString(16).toUpperCase().padStart(2, '0')


        const img = await bucketFill2(c!, pointer, hex === c!.backgroundColor ? 0.5 : 1)
        if (!img) return


        // set it as background object
        if (hex === c!.backgroundColor) {
          const { getVisibleObjects } = useDrawObjectManager()
          const visibleObjects = getVisibleObjects()
          const objects = c!.getObjects()
          const intersectingObjectIds = visibleObjects.filter(obj =>
            !obj.isBucketFill && img.intersectsWithObject(obj)).map(o => o.id)
          const indexes: number[] = []

          for (let i = 0; i < objects.length; i++) {
            const o = objects[i]
            if (intersectingObjectIds.includes(o.id)) indexes.push(i)
          }
          const lowestIndex = Math.min(...indexes)

          img.insertedIndex = lowestIndex
          c!.insertAt(lowestIndex, img)
        } else {
          c!.add(img)
        }


        c!.requestRenderAll()
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

  return { select, init, events }
})