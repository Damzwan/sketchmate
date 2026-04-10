import * as fabric from 'fabric'
import { Canvas, CanvasOptions, classRegistry, FabricObject } from 'fabric'
import { v4 as uuidv4 } from 'uuid'

import { BACKGROUND, CANVAS_SIZE } from '@/draw/config/canvas.config'
import { PixelStroke } from '@/draw/utils/brushes/PixelBrush'
import { CharcoalStroke } from '@/draw/utils/brushes/CharcoalBrush'
import { useAuthStore } from '@/store/auth.store'
import { WaterColorStroke } from '@/draw/utils/brushes/WaterColorBrush'
import { CalligraphyStroke } from '@/draw/utils/brushes/CalligraphyBrush'
import { CircleStroke } from '@/draw/utils/brushes/CustomCircleBrush'
import { BucketFillPath } from '@/draw/utils/BucketFillPath'
import { OptimizedPencilStroke } from '@/draw/utils/brushes/CustomPencilBrush'
import { OptimizedEraserStroke } from '@/draw/utils/brushes/CustomEraserBrush'
import { ClippingGroup } from '@erase2d/fabric'

export function changeFabricSettings() {
  FabricObject.customProperties = ['id', 'erasable', 'oldText', 'isBucketFill', 'insertedIndex', 'userId'];

  (FabricObject as any).ownDefaults!['erasable'] = true
  // (FabricObject as any).ownDefaults!['id'] = uuidv4(); // cannot use this because it needs to be dynamic :c


  classRegistry.setClass(OptimizedEraserStroke, 'OptimizedEraserStroke')
  classRegistry.setClass(PixelStroke, 'PixelStroke')
  classRegistry.setClass(CharcoalStroke, 'CharcoalStroke')
  classRegistry.setClass(WaterColorStroke, 'WaterColorStroke')
  classRegistry.setClass(CalligraphyStroke, 'CalligraphyStroke')
  classRegistry.setClass(CircleStroke, CircleStroke.type)
  classRegistry.setClass(BucketFillPath, 'BucketFillPath')
  classRegistry.setClass(OptimizedPencilStroke, 'OptimizedPencilStroke')

  const originalAdd = Canvas.prototype.add
  Canvas.prototype.add = function(...objects: any[]) {
    objects.forEach((obj) => {
      if (!obj.id) {
        obj.id = uuidv4() // Assign unique ID
      }
      if (!obj.userId) {
        const { user } = useAuthStore()
        obj.userId = user?._id
      }
    })
    return originalAdd.call(this, ...objects)
  }

  const originalInsertAt = Canvas.prototype.insertAt
  Canvas.prototype.insertAt = function(i, ...objects: any[]) {
    objects.forEach((obj) => {
      if (!obj.id) {
        obj.id = uuidv4() // Assign unique ID
      }
      if (!obj.userId) {
        const { user } = useAuthStore()
        obj.userId = user?._id
      }
    })
    return originalInsertAt.call(this, i, ...objects)
  }

  fabric.Canvas.prototype.getZoom = function() {
    const decomposition = fabric.util.qrDecompose(this.viewportTransform)
    // qrDecompose separates scale, translation, rotation, and skew.
    // We just return the true scale factor.
    return decomposition.scaleX
  }

  fabric.IText.prototype.mouseUpHandler = function({ e, transform }: any) {
    const didDrag = this.draggableTextDelegate && this.draggableTextDelegate.end(e)

    if (this.canvas) {
      this.canvas.textEditingManager && this.canvas.textEditingManager.unregister(this)

      const activeObject = this.canvas._activeObject
      if (activeObject && activeObject !== this) {
        return
      }
    }

    const notALeftClick = (e: Event) => !!(e as MouseEvent).button

    if (
      !this.editable ||
      (this.group && !this.group.interactive) ||
      (transform && transform.actionPerformed) ||
      notALeftClick(e) ||
      didDrag
    ) {
      return
    }

    if (this.selected && !this.getActiveControl()) {
      // We copied this function from the github repo to have control over the enter editing logic
    }
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
  const originalFindTarget = c.findTarget.bind(c)

  // @ts-ignore
  c.findTarget = function(e: MouseEvent) {
    const active = this._activeObject

    // Check if we should manually return the active object
    // @ts-ignore
    if (active && this._isClick) {
      const pointerEvent = e || (this as any)._mouseDownEvent
      const pointer = this.getScenePoint(pointerEvent)

      if (active.containsPoint(pointer)) {
        // Return the new required object structure
        return {
          target: active,
          subTargets: [] // Crucial: prevents the 'length' of undefined error
        }
      }
    }

    // Call original with the correct context and arguments
    return originalFindTarget(e)
  }
}

