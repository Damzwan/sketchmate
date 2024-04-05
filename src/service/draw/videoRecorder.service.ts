import { convertWebmToMp4, toDataUrl } from '@/helper/general.helper'
import { Canvas } from 'fabric/fabric-impl'
import { DrawEvent, FabricEvent } from '@/types/draw.types'
import { useEventManager } from '@/service/draw/eventManager.service'
import { EventBus } from '@/main'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import WebMWriter from 'webm-writer'


export function useVideoRecorder() {
  let c: Canvas | undefined
  const fps = 20
  const mittEvents = ['undo', 'redo', 'add_to_undo_stack']
  let imageDatas: [any, any, number][] = []
  let interval: any

  let processPromise: Promise<void>
  let videoWriter: any // Define videoWriter outside of the function scope to maintain its state
  let processedMp4: Blob | undefined // Store the processed mp4 blob


  const events: FabricEvent[] = [
    {
      type: DrawEvent.Video,
      on: 'mouse:down',
      handler: () => {
        captureSnapShot()
        interval = setInterval(captureSnapShot, 1000 / fps)
      }
    },
    {
      type: DrawEvent.Video,
      on: 'mouse:up',
      handler: () => {
        clearInterval(interval)
      }
    }
  ]

  async function init(canvas: Canvas) {
    c = canvas
    videoWriter = new WebMWriter({
      quality: 0.5,
      frameRate: fps
    })
    const { subscribe } = useEventManager()
    events.forEach(e => subscribe(e))
    mittEvents.forEach(e => {
      EventBus.on(e, () => {
        captureSnapShot(500)
        processPromise = processFrames()
      })
    })
  }

  async function captureSnapShot(duration = 1000 / fps) {
    const canvas1 = (c as any).lowerCanvasEl as HTMLCanvasElement
    const canvas2 = (c as any).upperCanvasEl as HTMLCanvasElement
    const ctx1 = canvas1.getContext('2d')
    const ctx2 = canvas2.getContext('2d')
    imageDatas.push([
      ctx1!.getImageData(0, 0, canvas1.width, canvas1.height),
      ctx2!.getImageData(0, 0, canvas2.width, canvas2.height),
      duration
    ])
  }

  async function processFrames() {
    if (imageDatas.length === 0) return

    const maxWorkers = navigator.hardwareConcurrency || 4 // Limit workers to the number of CPU cores, or default to 4

    // Split imageDatas into chunks for each web worker
    const chunkSize = Math.ceil(imageDatas.length / maxWorkers)
    const chunks = []
    for (let i = 0; i < imageDatas.length; i += chunkSize) {
      chunks.push(imageDatas.slice(i, i + chunkSize))
    }

    // Create a web worker for each chunk, up to the maximum allowed workers
    const workerPromises = chunks.slice(0, maxWorkers).map(async (chunk) => {
      const worker = new Worker('image_worker.js') // Path to frame processing worker script
      const results = await new Promise((resolve) => {
        worker.onmessage = (event) => resolve(event.data)
        worker.postMessage(chunk)
      })
      worker.terminate()
      return results
    })

    // Aggregate results from all web workers
    const processedData: any[] = await Promise.all(workerPromises)
    for (const workerResult of processedData) {
      for (const [dataUrl, duration] of workerResult) {
        videoWriter.addFrame(dataUrl, duration)
      }
    }

    imageDatas = []
  }

  async function exportVideo(): Promise<Blob | undefined> {
    await processPromise
    if (imageDatas.length > 0) {
      await processFrames()
    }

    const webmBlob = await videoWriter.complete()
    processedMp4 = await convertWebmToMp4(webmBlob)
    return processedMp4
  }

  function destroy() {
    c = undefined
  }

  return { init, destroy, exportVideo }
}
