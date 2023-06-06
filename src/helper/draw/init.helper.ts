import { WHITE } from '@/config/draw.config'
import { Canvas, ICanvasOptions } from 'fabric/fabric-impl'
import Hammer from 'hammerjs'
import { Ref } from 'vue'
import { fabric } from 'fabric'
import { v4 as uuidv4 } from 'uuid'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw/draw.store'

export function initCanvasOptions(): ICanvasOptions {
  return {
    isDrawingMode: true,
    width: window.innerWidth,
    height: window.innerHeight - 46 - 50,
    backgroundColor: WHITE,
    fireMiddleClick: true
  }
}

export function initGestures(c: Canvas, hammer: Ref<HammerManager | undefined>) {
  const upperCanvasEl = (c! as any).upperCanvasEl
  hammer.value = new Hammer.Manager(upperCanvasEl)
  hammer.value.add(new Hammer.Pinch())
}

export function changeFabricBaseSettings() {
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

  fabric.IText.prototype.isCurved = false
  fabric.IText.prototype.toObject = (function (toObject) {
    return function (this: any, propertiesToInclude) {
      propertiesToInclude = (propertiesToInclude || []).concat(['isCurved'])
      return toObject.apply(this, [propertiesToInclude])
    }
  })(fabric.IText.prototype.toObject)

  const originalITextSetOptions = fabric.IText.prototype.setOptions
  fabric.IText.prototype.setOptions = function (options) {
    originalITextSetOptions.call(this, options)
    const { isEditingText } = storeToRefs(useDrawStore())

    this.off('editing:entered')
    this.off('editing:exited')

    this.on('editing:entered', () => {
      isEditingText.value = true
    })

    this.on('editing:exited', () => {
      this.set({ hasControls: true })
    })
  }

  const og = fabric.IText.fromObject
  fabric.IText.fromObject = function (object, callback) {
    delete object.path
    return og(object, callback)
  }
}
