import { classRegistry, util } from 'fabric'
import { OptimizedEraserStroke } from '@/draw/utils/brushes/CustomEraserBrush'
import { OptimizedPencilStroke } from '@/draw/utils/brushes/CustomPencilBrush'
import { PixelStroke } from '@/draw/utils/brushes/PixelBrush'
import { CharcoalStroke } from '@/draw/utils/brushes/CharcoalBrush'
import { WaterColorStroke } from '@/draw/utils/brushes/WaterColorBrush'
import { CalligraphyStroke } from '@/draw/utils/brushes/CalligraphyBrush'
import { BucketFillPath } from '@/draw/utils/BucketFillPath'
import { CircleStroke } from '@/draw/utils/brushes/CustomCircleBrush'
import { NeonStroke } from '@/draw/utils/brushes/NeonSignBrush'
import { SprayStroke } from '@/draw/utils/brushes/CustomSprayBrush'
import { CrayonStroke } from '@/draw/utils/brushes/CrayonBrush'

// --- MOCK DOM & DISGUISE (Copied from your stable Preview Worker) ---
const applyCanvasDisguise = (canvas: any) => {
  canvas.hasAttribute = () => false
  canvas.getAttribute = () => null
  canvas.setAttribute = () => {
  }
  canvas.removeAttribute = () => {
  }
  canvas.style = {}
  canvas.classList = {
    add: () => {
    }, remove: () => {
    }, contains: () => false, toggle: () => {
    }
  }
  canvas.addEventListener = () => {
  }
  canvas.removeEventListener = () => {
  }
  canvas.dir = 'ltr'
  return canvas
}

if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        const mockCanvas = new OffscreenCanvas(1, 1)
        return applyCanvasDisguise(mockCanvas)
      }
      if (tag === 'img') {
        const img = {
          style: {},
          onload: null as any,
          onerror: null as any,
          _src: '',
          _bitmap: null as ImageBitmap | null,

          // Fabric v7 internal check helper
          get nodeName() {
            return 'IMG'
          },

          set ['src'](value: string) {
            this._src = value
            fetch(value)
              .then(res => res.blob())
              .then(blob => createImageBitmap(blob))
              .then(bitmap => {
                this._bitmap = bitmap;
                (this as any).width = bitmap.width;
                (this as any).height = bitmap.height;

                // Fabric uses the 'complete' property to check status
                (this as any).complete = true

                if (this.onload) this.onload()
              })
              .catch(err => {
                console.error('Worker Image Load Error:', err)
                if (this.onerror) this.onerror(err)
              })
          },
          get ['src']() {
            return this._src
          },

          // CRITICAL: When Fabric calls drawImage, it usually passes its internal '_element'.
          // We need to trick the proxying if Fabric tries to read this object.
          width: 0,
          height: 0,
          nodeType: 1,
          parentNode: null,
          ownerDocument: (globalThis as any).document,
          addEventListener: () => {
          },
          removeEventListener: () => {
          },
          getAttribute: (name: string) => name === 'src' ? (img as any)._src : null,
          hasAttribute: () => false,
          setAttribute: () => {
          },
          classList: {
            add: () => {
            }, remove: () => {
            }
          }
        }
        return img
      }
      throw new Error(`Worker mock document cannot create ${tag}`)
    }
  };
  (globalThis as any).window = globalThis
}

self.onmessage = async (e: MessageEvent) => {
  const { reqId, object, multiplier } = e.data

  try {
    const brushes = [
      [OptimizedEraserStroke, 'OptimizedEraserStroke'],
      [PixelStroke, 'PixelStroke'],
      [CharcoalStroke, 'CharcoalStroke'],
      [WaterColorStroke, 'WaterColorStroke'],
      [CalligraphyStroke, 'CalligraphyStroke'],
      [BucketFillPath, 'BucketFillPath'],
      [OptimizedPencilStroke, 'OptimizedPencilStroke'],
      [CircleStroke, CircleStroke.type],
      [SprayStroke, SprayStroke.type],
      [NeonStroke, NeonStroke.type],
      [CrayonStroke, CrayonStroke.type]
    ] as const
    brushes.forEach(([cls, name]) => classRegistry.setClass(cls, name))

    const enlivened = await util.enlivenObjects([object])
    const obj: any = enlivened[0]

    // image barrier (unchanged)
    await Promise.all(
      enlivened
        .filter((o: any) => o.type === 'image' && o._element)
        .map((o: any) => new Promise((resolve) => {
          const m = o._element
          if (m._bitmap) return resolve(true)
          const prev = m.onload
          m.onload = () => { if (prev) prev(); resolve(true) }
          setTimeout(() => resolve(false), 5000)
        }))
    )
    enlivened.forEach((o: any) => {
      if (o.type === 'image' && o._element?._bitmap) o._element = o._element._bitmap
    })

    const el: any = obj.toCanvasElement({ multiplier })
    const w = el.width, h = el.height
    if (!w || !h) return self.postMessage({ reqId, survivors: 0 })

    const ctx = el.getContext('2d', { willReadFrequently: true })
    const data = ctx.getImageData(0, 0, w, h).data

    let visible = 0
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 15) visible++
    }

    self.postMessage({ reqId, survivors: visible })
  } catch (err: any) {
    self.postMessage({ reqId, error: err.message })
  }
}