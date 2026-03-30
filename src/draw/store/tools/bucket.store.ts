import { FabricEvent, ToolService } from '@/draw/types/draw.types'
import { defineStore } from 'pinia'
import { isMobile } from '@/helper/general.helper'
import { bucketFill } from '@/draw/helpers/tools/bucket.helper'
import { Canvas, Point } from 'fabric'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { bucketFill2 } from '@/draw/helpers/tools/bucket2.helper'

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
        const pointer: Point = c!.getViewportPoint(o.e)
        const img = await bucketFill2(c!, pointer)
        if (!img) return

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

        // img.insertedIndex = lowestIndex
        // c!.insertAt(lowestIndex, img)
        c.add(img)
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