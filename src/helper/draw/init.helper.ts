import { Canvas, ICanvasOptions } from 'fabric/fabric-impl'
import Hammer from 'hammerjs'
import { Ref } from 'vue'
import { fabric } from 'fabric'
import { v4 as uuidv4 } from 'uuid'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw/draw.store'
import { BACKGROUND } from '@/config/draw.config'
import { DrawTool, ToolService } from '@/types/draw.types'
import { usePen } from '@/service/draw/tools/pen.tool'
import { useEraser } from '@/service/draw/tools/eraser.tool'
import { useHealingEraser } from '@/service/draw/tools/healingEraser.tool'
import { useSelect } from '@/service/draw/tools/select.tool'
import { useLasso } from '@/service/draw/tools/lasso.tool'
import { useBucket } from '@/service/draw/tools/bucket.tool'
import { isPlatform, useKeyboard } from '@ionic/vue'
import { isMobile } from '@/helper/general.helper'
import { useAppStore } from '@/store/app.store'
import { splitStringToWidth } from '@/helper/draw/draw.helper'

export function initCanvasOptions(): ICanvasOptions {
  return {
    isDrawingMode: true,
    width: window.innerWidth,
    height: window.innerHeight - 46 - 50,
    backgroundColor: BACKGROUND,
    fireMiddleClick: true
  }
}

export function initGestures(c: Canvas, hammer: Ref<HammerManager | undefined>) {
  const upperCanvasEl = (c! as any).upperCanvasEl
  hammer.value = new Hammer.Manager(upperCanvasEl)
  hammer.value.add(new Hammer.Pinch())
}

export function changeFabricBaseSettings(c: Canvas) {
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--ion-color-primary').trim()
  fabric.Object.prototype.transparentCorners = false
  fabric.Object.prototype.cornerColor = primaryColor
  fabric.Object.prototype.cornerStyle = 'circle'
  fabric.Object.prototype.cornerSize = 20 // Increase the size of the handles

  const originalSetOptions = fabric.Object.prototype.setOptions
  fabric.Object.prototype.setOptions = function (options) {
    originalSetOptions.call(this, options)
    if (!this.id) this.id = uuidv4()
  }
  fabric.Object.prototype.toObject = (function (toObject) {
    return function (this: any, propertiesToInclude) {
      propertiesToInclude = (propertiesToInclude || []).concat(['id'])
      return toObject.apply(this, [propertiesToInclude])
    }
  })(fabric.Object.prototype.toObject)

  // Text editing
  const originalITextSetOptions = fabric.IText.prototype.setOptions
  fabric.IText.prototype.setOptions = function (options) {
    originalITextSetOptions.call(this, options)
    const { isEditingText } = storeToRefs(useDrawStore())

    this.off('editing:entered')
    this.off('editing:exited')

    this.on('editing:entered', () => {
      if (isMobile()) {
        setTimeout(() => {
          const { keyboardHeight, appHeight } = useAppStore()

          // Save original position
          this.originalTop = this.top

          if (this.top! + this.height! + keyboardHeight > appHeight) {
            this.set({ top: this.top! - keyboardHeight })
            c.renderAll()
          }
        }, 200)
      }
      isEditingText.value = true
    })

    this.on('editing:exited', () => {
      if (isMobile()) {
        // Revert back to the original position
        this.set({ top: this.originalTop })
      }
      this.set({ hasControls: true })
    })

    this.on('changed', () => {
      const deviceWidth: number = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth
      if (this.width! > deviceWidth) {
        const newString: string = splitStringToWidth(this.text!, this.fontSize!, this.fontFamily!, deviceWidth)
        this.exitEditing() // exit editing mode while manipulating the text
        this.set('text', newString)
        this.enterEditing() // re-enter editing mode
        this.setSelectionStart(newString.length)
        this.setSelectionEnd(newString.length)
        c.renderAll()
      }
    })
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
