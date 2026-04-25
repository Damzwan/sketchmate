import * as fabric from 'fabric'
import { Canvas, CanvasOptions, classRegistry, FabricObject, IText } from 'fabric'
import { v4 as uuidv4 } from 'uuid'

import { BACKGROUND } from '@/draw/config/canvas.config'
import { PixelStroke } from '@/draw/utils/brushes/PixelBrush'
import { CharcoalStroke } from '@/draw/utils/brushes/CharcoalBrush'
import { useAuthStore } from '@/store/auth.store'
import { WaterColorStroke } from '@/draw/utils/brushes/WaterColorBrush'
import { CalligraphyStroke } from '@/draw/utils/brushes/CalligraphyBrush'
import { CircleStroke } from '@/draw/utils/brushes/CustomCircleBrush'
import { BucketFillPath } from '@/draw/utils/BucketFillPath'
import { OptimizedPencilStroke } from '@/draw/utils/brushes/CustomPencilBrush'
import { OptimizedEraserStroke } from '@/draw/utils/brushes/CustomEraserBrush'
import {
  finalizeLayeredRender,
  isLayeredRenderActive,
  prepareLayeredBuffers,
  renderLayeredBuffers
} from '@/draw/helpers/customTransform.helper'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { Rect } from '@/draw/utils/QuadTree'

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

  fabric.InteractiveFabricObject.prototype._renderControls = function(c: CanvasRenderingContext2D,
                                                                      styleOverride: any = {}) {
    if (!this.canvas) return
    const ctx = this.canvas.getTopContext()
    const { hasBorders, hasControls } = this
    const styleOptions = {
      hasBorders,
      hasControls,
      ...styleOverride
    }
    const vpt = this.getViewportTransform(),
      shouldDrawBorders = styleOptions.hasBorders,
      shouldDrawControls = styleOptions.hasControls
    const matrix = fabric.util.multiplyTransformMatrices(vpt, this.calcTransformMatrix())
    const options = fabric.util.qrDecompose(matrix)
    ctx.save()
    ctx.translate(options.translateX, options.translateY)
    ctx.lineWidth = this.borderScaleFactor // 1 * this.borderScaleFactor;
    // since interactive groups have been introduced, an object could be inside a group and needing controls
    // the following equality check `this.group === this.parent` covers:
    // object without a group ( undefined === undefined )
    // object inside a group
    // excludes object inside a group but multi selected since group and parent will differ in value
    if (this.group === this.parent) {
      ctx.globalAlpha = this.isMoving ? this.borderOpacityWhenMoving : 1
    }
    if (this.flipX) {
      options.angle -= 180
    }
    ctx.rotate(fabric.util.degreesToRadians(this.group ? options.angle : this.angle))
    shouldDrawBorders && this.drawBorders(ctx, options, styleOverride)
    shouldDrawControls && this.drawControls(ctx, styleOverride)
    ctx.restore()
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
  const SEARCH_PADDING = 10

  // @ts-ignore
  c.findTarget = function(e: TPointerEvent): FullTargetsInfoWithContainer {
    const pointer = this.getScenePoint(e)
    const activeObject = this._activeObject

    // 1. Active object's controls take priority — no spatial lookup needed
    // @ts-ignore
    if (activeObject && this._isClick) {
      const pointerEvent = e || (this as any)._mouseDownEvent
      const pointer = this.getScenePoint(pointerEvent)

      if (activeObject.containsPoint(pointer)) {
        // Return the new required object structure
        return {
          target: activeObject,
          subTargets: [] // Crucial: prevents the 'length' of undefined error
        }
      }
    }

    if (this._targetInfo) return this._targetInfo

    if (this.skipTargetFind) {
      return { subTargets: [], currentSubTargets: [] }
    }

    // 2. Quadtree candidates → pick topmost hit
    const candidates = useDrawObjectManager().query(new Rect(
      pointer.x - SEARCH_PADDING,
      pointer.y - SEARCH_PADDING,
      SEARCH_PADDING * 2,
      SEARCH_PADDING * 2
    ))
    const aObjects = this.getActiveObjects(),
      targetInfo = this.searchPossibleTargets(candidates, pointer)

    const {
      subTargets: currentSubTargets,
      container: currentContainer,
      target: currentTarget
    } = targetInfo

    const fullTargetInfo: any = {
      ...targetInfo,
      currentSubTargets,
      currentContainer,
      currentTarget
    }

    // simplest case no active object, return a new target
    if (!activeObject) {
      return fullTargetInfo
    }

    // check pointer is over active selection and possibly perform `subTargetCheck`
    const activeObjectTargetInfo: any = {
      ...this.searchPossibleTargets([activeObject], pointer),
      currentSubTargets,
      currentContainer,
      currentTarget
    }

    const activeObjectControl = activeObject.findControl(
      this.getViewportPoint(e),
      fabric.util.isTouchEvent(e)
    )

    // we are clicking exactly the control of an active object, shortcut to that object.
    if (activeObjectControl) {
      return {
        ...activeObjectTargetInfo,
        target: activeObject // we override target in case we are in the outside part of the corner.
      }
    }

    // in case we are over the active object
    if (activeObjectTargetInfo.target) {
      if (aObjects.length > 1) {
        // in case of active selection and target hit over the activeSelection, just exit
        // TODO Verify if we need to override target with container
        return activeObjectTargetInfo
      }
      // from here onward not an active selection, just an activeOject that maybe is a group

      // preserveObjectStacking is false, so activeObject is drawn on top, just return activeObject
      if (!this.preserveObjectStacking) {
        // TODO Verify if we need to override target with container
        return activeObjectTargetInfo
      }

      // In case we are in preserveObjectStacking ( selection in stack )
      // there is the possibility to force with `altSelectionKey` to return the activeObject
      // from any point in the stack, even if we have another object completely on top of it.
      if (
        this.preserveObjectStacking &&
        e[this.altSelectionKey as any]
      ) {
        // TODO Verify if we need to override target with container
        return activeObjectTargetInfo
      }
    }

    // we have an active object, but we ruled out it being our target in any way.
    return fullTargetInfo
  }
}

export function overrideMouseUp(c: Canvas) {
  // @ts-ignore
  c.__onMouseUp = function(e: TPointerEvent) {
    this._handleEvent(e, 'up:before')

    const transform = this._currentTransform
    // @ts-ignore
    const isClick = this._isClick
    const { target } = this.findTarget(e)

    // if right/middle click just fire events and return
    // target undefined will make the _handleEvent search the target
    const { button } = e as MouseEvent
    if (button) {
      ((this.fireMiddleClick && button === 1) ||
        (this.fireRightClick && button === 2)) &&
      this._handleEvent(e, 'up')
      return
    }

    if (this.isDrawingMode && this._isCurrentlyDrawing) {
      this._onMouseUpInDrawingMode(e)
      return
    }

    if (!this._isMainEvent(e)) {
      return
    }
    let shouldRender = false
    if (transform) {
      this._finalizeCurrentTransform(e)
      shouldRender = transform.actionPerformed
    }
    if (!isClick) {
      const targetWasActive = target === this._activeObject
      this.handleSelection(e)
      if (!shouldRender) {
        shouldRender =
          this._shouldRender(target) ||
          (!targetWasActive && target === this._activeObject)
      }
    }
    let pointer, corner
    if (target) {
      const found = target.findControl(
        this.getViewportPoint(e),
        fabric.util.isTouchEvent(e)
      )
      const { key, control } = found || {}
      corner = key
      if (
        target.selectable &&
        target !== this._activeObject &&
        target.activeOn === 'up'
      ) {
        this.setActiveObject(target, e)
      } else if (control) {
        const mouseUpHandler = control.getMouseUpHandler(e, target, control)
        if (mouseUpHandler) {
          pointer = this.getScenePoint(e)
          mouseUpHandler.call(control, e, transform!, pointer.x, pointer.y)
        }
      }
      target.isMoving = false
    }
    // if we are ending up a transform on a different control or a new object
    // fire the original mouse up from the corner that started the transform
    if (
      transform &&
      (transform.target !== target || transform.corner !== corner)
    ) {
      const originalControl =
          transform.target && transform.target.controls[transform.corner],
        originalMouseUpHandler =
          originalControl &&
          originalControl.getMouseUpHandler(
            e,
            transform.target,
            originalControl
          )
      pointer = pointer || this.getScenePoint(e)
      originalMouseUpHandler &&
      originalMouseUpHandler.call(
        originalControl,
        e,
        transform,
        pointer.x,
        pointer.y
      )
    }

    this._setCursorFromEvent(e, target)
    this._handleEvent(e, 'up')
    this._groupSelector = null
    this._currentTransform = null
    // reset the target information about which corner is selected
    target && (target.__corner = undefined)
    if (shouldRender) {
      this.requestRenderAll()
    } else { // @ts-ignore
      if (!isClick && !this._activeObject && !(this._activeObject as IText)?.isEditing) {
            this.renderTop()
          }
    }
  }
}

export function overrideMouseDown(c: Canvas) {
  // @ts-ignore
  c.__onMouseDown = function(e: TPointerEvent) {

    // @ts-ignore
    this._isClick = true
    this._handleEvent(e, 'down:before')

    let { target } = this.findTarget(e)
    let alreadySelected = !!target && target === this._activeObject
    // if right/middle click just fire events
    const { button } = e as MouseEvent

    if (button) {
      ((this.fireMiddleClick && button === 1) ||
        (this.fireRightClick && button === 2)) &&
      this._handleEvent(e, 'down', {
        alreadySelected
      })
      return
    }

    if (button === 1) return



    if (this.isDrawingMode) {
      this._onMouseDownInDrawingMode(e)
      return
    }

    if (!this._isMainEvent(e)) {
      return
    }

    // ignore if some object is being transformed at this moment
    if (this._currentTransform) {
      return
    }

    let shouldRender = this._shouldRender(target)
    let grouped = false
    if (this.handleMultiSelection(e, target)) {
      // active object might have changed while grouping
      target = this._activeObject
      grouped = true
      shouldRender = true
    } else if (this._shouldClearSelection(e, target)) {
      this.discardActiveObject(e)
    }
    // we start a group selector rectangle if
    // selection is enabled
    // and there is no target, or the following 3 conditions are satisfied:
    // target is not selectable ( otherwise we selected it )
    // target is not editing
    // target is not already selected ( otherwise we drag )
    if (
      this.selection &&
      (!target ||
        (!target.selectable &&
          !(target as IText).isEditing &&
          target !== this._activeObject))
    ) {
      const p = this.getScenePoint(e)
      this._groupSelector = {
        x: p.x,
        y: p.y,
        deltaY: 0,
        deltaX: 0
      }
    }

    // check again because things could have changed
    alreadySelected = !!target && target === this._activeObject
    if (target) {
      if (target.selectable && target.activeOn === 'down') {
        this.setActiveObject(target, e)
      }
      const handle = target.findControl(
        this.getViewportPoint(e),
        fabric.util.isTouchEvent(e)
      )
      if (target === this._activeObject && (handle || !grouped)) {
        this._setupCurrentTransform(e, target, alreadySelected)
        const control = handle ? handle.control : undefined,
          pointer = this.getScenePoint(e),
          mouseDownHandler =
            control && control.getMouseDownHandler(e, target, control)
        mouseDownHandler &&
        mouseDownHandler.call(
          control,
          e,
          this._currentTransform!,
          pointer.x,
          pointer.y
        )
      }
    }
    //  we clear `_objectsToRender` in case of a change in order to repopulate it at rendering
    //  run before firing the `down` event to give the dev a chance to populate it themselves
    shouldRender && (this._objectsToRender = undefined)
    this._handleEvent(e, 'down', { alreadySelected: alreadySelected })
    // we must renderAll so that we update the visuals
    // shouldRender && this.requestRenderAll()
  }

}


/**
 * Optimized Layered Rendering Override
 * * PROBLEM:
 * When 'preserveObjectStacking' is true, Fabric.js must re-render every object in the
 * stack during movement to maintain correct Z-indexing. On dense canvases (many paths),
 * this causes massive CPU lag as the browser struggles to parse thousands of vector
 * commands per frame.
 * * SOLUTION:
 * On interaction start (mousedown), we take two high-resolution snapshots:
 * 1. A 'Background Buffer' of all objects below the selected item.
 * 2. A 'Foreground Buffer' of all objects above the selected item.
 * * During movement, we skip the vector engine entirely. We simply draw:
 * Background Image -> Active Object -> Foreground Image.
 * This is GPU-accelerated and maintains 60FPS regardless of object count.
 */
export function overrideTransform(canvas: Canvas) {

  canvas.on('mouse:down', (e: any) => {
    if (!e.target || e.e.button === 1) return
    prepareLayeredBuffers(canvas, e.target)
    canvas.clearContext(canvas.contextTop)
    e.target._renderControls(canvas.contextTop)
  })


  // Hook into the core loop
  canvas._transformObject = function(e: MouseEvent) {
    const scenePoint = this.getScenePoint(e)
    const transform = this._currentTransform!
    const target = transform.target


    const localPointer = target.group ?
      fabric.util.sendPointToPlane(scenePoint, undefined, target.group.calcTransformMatrix()) :
      scenePoint

    transform.shiftKey = e.shiftKey
    transform.altKey = !!this.centeredKey && (e as any)[this.centeredKey]

    this._performTransformAction(e, transform, localPointer)

    if (transform.actionPerformed) {
      if (isLayeredRenderActive) {
        renderLayeredBuffers(this, target)
      } else {
        this.requestRenderAll()
      }
    }
  }

  canvas.on('mouse:up', () => finalizeLayeredRender(canvas))
}