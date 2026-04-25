import { Canvas } from 'fabric'
import * as fabric from 'fabric'
import { useToast } from '@/service/toast.service'
import { ToastDuration } from '@/types/toast.types'

export function isCanvasHealthy(c: any): boolean {
  try {
    const canvasEl = c.getElement()
    const ctx = canvasEl.getContext('2d', { willReadFrequently: true })
    if (!ctx) return false

    const originalPixel = ctx.getImageData(0, 0, 1, 1)

    ctx.fillStyle = 'rgba(12, 34, 56, 1)'
    ctx.fillRect(0, 0, 1, 1)

    const testPixel = ctx.getImageData(0, 0, 1, 1).data

    ctx.putImageData(originalPixel, 0, 0)

    // 5. Verify the dye held. If the canvas is dead, testPixel will be [0, 0, 0, 0].
    // We check if the alpha channel (index 3) is 0. If it is, the write failed.
    if (testPixel[3] === 0) {
      return false
    }

    return true
  } catch (e) {
    return false
  }
}

export async function attemptPartialRecovery(c: Canvas, savedJson: string, progressSaver: any) {
  try {
    const parsedData = typeof savedJson === 'string' ? JSON.parse(savedJson) : savedJson

    // 1. Sanity check dimensions
    const maxWidth = 8192
    const maxHeight = 8192

    if (parsedData.width > maxWidth || parsedData.height > maxHeight) {
      console.warn('Canvas dimensions dangerously large. Resetting to viewport size.')
      // CORRECTED: Use setDimensions
      c.setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      })
    } else {
      c.setDimensions({
        width: parsedData.width || window.innerWidth,
        height: parsedData.height || window.innerHeight
      })
    }

    // 2. Restore background
    if (parsedData.background) {
      c.backgroundColor = parsedData.background
    }

    // 3. Carefully enliven objects one by one
    if (parsedData.objects && Array.isArray(parsedData.objects)) {
      // We use a for...of loop to maintain order while allowing async/await
      for (const objData of parsedData.objects) {
        try {
          // Use fabric.util.enlivenObjects to turn JSON into Fabric instances
          const [enlivenedObj] = await new Promise<any[]>((resolve, reject) => {
            fabric.util.enlivenObjects([objData])
              .then(resolve)
              .catch(reject)
          })

          if (enlivenedObj) {
            c.add(enlivenedObj)
          }
        } catch (objError) {
          // A single corrupted object won't stop the whole recovery
          console.error('Skipped one corrupted object:', objError)
        }
      }
    }

    c.requestRenderAll()
    console.log('Partial recovery successful.')

  } catch (fatalError) {
    console.error('Total data corruption. Wiping state.', fatalError)
    progressSaver.clear()

    const { toast } = useToast()
    toast('We\'re sorry, your last drawing was heavily corrupted and had to be reset', {
      color: 'danger',
      duration: 5000 // Standardize your duration constant here
    })
  }
}