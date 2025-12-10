import * as fabric from 'fabric'
import { Canvas, CanvasOptions, FabricObject } from 'fabric'
import { v4 as uuidv4 } from 'uuid'

import { BACKGROUND, CANVAS_SIZE } from '@/draw/config/canvas.config'

export function changeFabricSettings() {
  FabricObject.customProperties = ['id', 'erasable', 'prevClipPath', 'oldText'];

  (FabricObject as any).ownDefaults!['erasable'] = true
  // (FabricObject as any).ownDefaults!['id'] = uuidv4(); // cannot use this because it needs to be dynamic :c

  const originalAdd = Canvas.prototype.add
  Canvas.prototype.add = function(...objects: any[]) {
    objects.forEach((obj) => {
      if (!obj.id) {
        obj.id = uuidv4() // Assign unique ID
      }
    })
    return originalAdd.call(this, ...objects)
  }

  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim()

  fabric.InteractiveFabricObject.ownDefaults = {
    ...fabric.InteractiveFabricObject.ownDefaults,
    transparentCorners: false,
    cornerColor: primaryColor,
    cornerStyle: 'circle',
    cornerSize: 30,
    originX: 'center',
    originY: 'center',
    _controlsVisibility: {
      bl: false,
      br: true,
      mb: false,
      ml: false,
      mr: false,
      mt: false,
      mtr: true,
      tl: false,
      tr: false
    }
  }

  const textKeysMap = fabric.IText.ownDefaults.keysMap
  if (!textKeysMap) return
  delete textKeysMap[9]
  delete textKeysMap[27]
  fabric.IText.ownDefaults = {
    ...fabric.IText.ownDefaults,
    keysMap: textKeysMap
  }


}

export function initCanvasOptions(width: number, height: number): Partial<CanvasOptions> {
  return {
    width,
    height,
    isDrawingMode: true,
    backgroundColor: BACKGROUND,
    fireMiddleClick: true,
    selection: false,
    preserveObjectStacking: true,
    renderOnAddRemove: false
  }
}


export function overrideFindTarget(c: Canvas) {
  c.findTarget = (function(originalFn: Function) {
    return function(e?: any) {
      // @ts-ignore
      const canvasThis: any = this
      const active = canvasThis._activeObject

      if (active && canvasThis._isClick) {
        const pointerEvent = e || canvasThis._mouseDownEvent
        const pointer = canvasThis.getPointer(pointerEvent)
        if (active.containsPoint(pointer)) {
          return active
        }
      }

      // @ts-ignore
      return originalFn.apply(this, arguments)
    }
  })(c.findTarget)
}

export function initBorderRenderer(c: Canvas) {
  c.on('after:render', () => {
    if (!c) return
    const ctx = c.getContext()
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1

    ctx.save()

    if (c.viewportTransform) {
      const v = c.viewportTransform
      ctx.setTransform(
        v[0] * dpr,
        v[1] * dpr,
        v[2] * dpr,
        v[3] * dpr,
        v[4] * dpr,
        v[5] * dpr
      )
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    ctx.strokeStyle = '#B9463A'
    ctx.lineWidth = 10
    ctx.strokeRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    ctx.restore()
  })
}
