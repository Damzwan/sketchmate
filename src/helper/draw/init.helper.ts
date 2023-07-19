import { Canvas, ICanvasOptions, IText } from 'fabric/fabric-impl'
import Hammer from 'hammerjs'
import { Ref } from 'vue'
import { fabric } from 'fabric'
import { v4 as uuidv4 } from 'uuid'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw/draw.store'
import { BACKGROUND } from '@/config/draw/draw.config'
import { DrawTool, ToolService } from '@/types/draw.types'
import { usePen } from '@/service/draw/tools/pen.tool'
import { useEraser } from '@/service/draw/tools/eraser.tool'
import { useHealingEraser } from '@/service/draw/tools/healingEraser.tool'
import { useSelect } from '@/service/draw/tools/select.tool'
import { useLasso } from '@/service/draw/tools/lasso.tool'
import { useBucket } from '@/service/draw/tools/bucket.tool'
import { isNative } from '@/helper/general.helper'
import { useAppStore } from '@/store/app.store'
import { exitEditing, isText, splitStringToWidth } from '@/helper/draw/draw.helper'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

export function initCanvasOptions(): ICanvasOptions {
  return {
    isDrawingMode: true,
    width: window.innerWidth,
    height: window.innerHeight - 46 - 50,
    backgroundColor: BACKGROUND,
    fireMiddleClick: true,
    selection: false
  }
}

export function initGestures(c: Canvas, hammer: Ref<HammerManager | undefined>) {
  const upperCanvasEl = (c! as any).upperCanvasEl
  hammer.value = new Hammer.Manager(upperCanvasEl)
  hammer.value.add(new Hammer.Pinch())
  hammer.value?.add(new Hammer.Rotate())
}

export function changeFabricBaseSettings(c: Canvas) {
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim()
  fabric.Object.prototype.transparentCorners = false
  fabric.Object.prototype.cornerColor = primaryColor
  fabric.Object.prototype.cornerStyle = 'circle'
  fabric.Object.prototype.cornerSize = 20 // Increase the size of the handles

  // Activated because of the stupid gestures mixin
  c._rotateObjectByAngle = undefined
  c._scaleObjectBy = undefined

  c.on('touch:longpress', e => {
    const touchType = e.e.type
    if (touchType != 'touchstart') return
    const { selectedObjectsRef, setMultiSelectMode } = useSelect()

    if (isText(selectedObjectsRef)) {
      exitEditing(selectedObjectsRef[0] as IText)
    }
    if (selectedObjectsRef.length > 0) {
      setMultiSelectMode(true)
      Haptics.impact({ style: ImpactStyle.Medium })
    }
  })

  c.on('mouse:down:before', function (options) {
    const { setMouseClickTarget } = useSelect()
    setMouseClickTarget(options.target)
  })

  const originalInitialize = fabric.Object.prototype.initialize
  fabric.Object.prototype.initialize = function (...args) {
    originalInitialize.call(this, ...args)
    this.setControlsVisibility({
      bl: false,
      br: true,
      mb: false,
      ml: false,
      mr: false,
      mt: false,
      mtr: true,
      tl: false,
      tr: false
    })
    if (!this.id) this.id = uuidv4()
    return this
  }

  fabric.Object.prototype.toObject = (function (toObject) {
    return function (this: any, propertiesToInclude) {
      propertiesToInclude = (propertiesToInclude || []).concat(['id'])
      return toObject.apply(this, [propertiesToInclude])
    }
  })(fabric.Object.prototype.toObject)

  const originalITextInit = fabric.IText.prototype.initialize

  fabric.IText.prototype.initialize = function (...args) {
    originalITextInit.call(this, ...args)
    this.off('editing:entered')
    this.off('editing:exited')
    const { isEditingText } = storeToRefs(useDrawStore())

    this.on('editing:entered', () => {
      if (isNative()) {
        const { keyboardHeight } = useAppStore()

        // Save original position
        this.originalTop = this.top

        if (this.top! + this.height! + keyboardHeight > window.innerHeight) {
          this.set({ top: this.top! - keyboardHeight })
        }
      }
      isEditingText.value = true
      c.renderAll()
    })

    this.on('editing:exited', () => {
      if (isNative()) {
        this.set({ top: this.originalTop })
      }
      this.set({ hasControls: true })
      c.renderAll()
    })

    this.on('changed', () => {
      const deviceWidth: number = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth
      if (this.width! > deviceWidth) {
        const newString: string = splitStringToWidth(this.text!, this.fontSize!, this.fontFamily!, deviceWidth)
        this.set('text', newString)
        this.setSelectionStart(newString.length)
        this.setSelectionEnd(newString.length)
        c.renderAll()
      }
    })
    return this
  }

  const ogMouseUp = fabric.IText.prototype.mouseUpHandler
  fabric.IText.prototype.mouseUpHandler = function (o) {
    const { multiSelectMode } = useSelect()
    const { isUsingGesture } = useDrawStore()
    if (multiSelectMode || isUsingGesture) return
    ogMouseUp.call(this, o)
  }

  // text curve
  const og = fabric.IText.fromObject
  fabric.IText.fromObject = function (object, callback) {
    delete object.path
    return og(object, callback)
  }

  fabric.IText.prototype.isCurved = false
  fabric.IText.prototype.toObject = (function (toObject) {
    return function (this: any, propertiesToInclude) {
      propertiesToInclude = (propertiesToInclude || []).concat(['isCurved'])
      return toObject.apply(this, [propertiesToInclude])
    }
  })(fabric.IText.prototype.toObject)
}

export function createTools(): { [key in DrawTool]: ToolService } {
  return {
    [DrawTool.Pen]: usePen(),
    [DrawTool.MobileEraser]: useEraser(),
    [DrawTool.HealingEraser]: useHealingEraser(),
    [DrawTool.Select]: useSelect(),
    [DrawTool.Lasso]: useLasso(),
    [DrawTool.Bucket]: useBucket()
  }
}

export function initTools(c: Canvas, tools: { [key in DrawTool]: ToolService }) {
  for (const [_, tool] of Object.entries(tools)) {
    tool.init(c)
  }
}

export function destroyTools(tools: { [key in DrawTool]: ToolService }) {
  for (const [_, tool] of Object.entries(tools)) {
    tool.destroy()
  }
}
