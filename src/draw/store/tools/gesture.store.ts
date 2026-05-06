// src/draw/store/gesture.store.ts
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { Canvas } from 'fabric'

export const useGestureStore = defineStore('gestureStore', () => {
  // The stable vitals: what is physically painted on the offscreen canvas right now
  const renderedVpt = ref<number[]>([1, 0, 0, 1, 0, 0])

  // Is the patient currently undergoing an active gesture procedure?
  const isGesturing = ref(false)

  const minZoom = ref(0.2)
  const maxZoom = ref(50)

  function setRenderedVpt(vpt: number[]) {
    renderedVpt.value = [...vpt]
  }

  // Hardware-accelerated blitting: copies the offscreen buffer using relative math
  function fastBlit(c: Canvas, offCanvas: HTMLCanvasElement, ghostBoxes: any[] = []) {
    const mainCtx = c.getContext()
    const targetVpt = c.viewportTransform!
    const rVpt = renderedVpt.value

    // Support Retina displays correctly
    const physWidth = c.getElement().width
    const physHeight = c.getElement().height

    // 1. Wipe the physical canvas screen
    mainCtx.save()
    mainCtx.setTransform(1, 0, 0, 1, 0, 0)
    mainCtx.clearRect(0, 0, physWidth, physHeight)
    mainCtx.restore()

    // 2. Calculate the relative difference for the stable canvas
    const zRel = targetVpt[0] / (rVpt[0] || 1)
    const txRel = targetVpt[4] - (zRel * rVpt[4])
    const tyRel = targetVpt[5] - (zRel * rVpt[5])

    // 3. Draw the Stable Bitmap Image
    mainCtx.save()
    mainCtx.translate(txRel, tyRel)
    mainCtx.scale(zRel, zRel)

    mainCtx.drawImage(
      offCanvas,
      0, 0, offCanvas.width, offCanvas.height,
      0, 0, c.width!, c.height!
    )
    mainCtx.restore()

    // 4. Draw the logical ghost boxes perfectly synced to the live viewport
    if (ghostBoxes.length > 0) {
      mainCtx.save()
      mainCtx.translate(targetVpt[4], targetVpt[5]) // Live Pan
      mainCtx.scale(targetVpt[0], targetVpt[0])     // Live Zoom

      drawGhosts(mainCtx, ghostBoxes, targetVpt[0])
      mainCtx.restore()
    }
  }


  function drawGhosts(ctx: CanvasRenderingContext2D, boxes: any[], relativeScale: number) {
    const globalAlpha = 0.6 + Math.sin(Date.now() / 300) * 0.3
    ctx.globalAlpha = globalAlpha
    ctx.fillStyle = 'rgba(120, 120, 128, 0.1)'
    ctx.strokeStyle = 'rgba(120, 120, 128, 0.14)'

    // Keeps the border exactly 1 pixel thick on the user's screen
    ctx.lineWidth = 1 / relativeScale

    if (boxes.length > 200) {
      // 🚨 HIGH-DENSITY EMERGENCY MODE
      ctx.beginPath()
      for (const box of boxes) {
        ctx.rect(box.left, box.top, box.width, box.height)
      }
      ctx.fill()
      ctx.stroke()
    } else {
      // 🟢 NORMAL MODE
      const cornerRadius = 8 / relativeScale

      for (const box of boxes) {
        ctx.beginPath()
        ctx.roundRect(box.left, box.top, box.width, box.height, cornerRadius)
        ctx.fill()
        ctx.stroke()

        if (box.type?.includes('text')) {
          ctx.fillStyle = 'rgba(120, 120, 128, 0.28)'
          const lineH = Math.max(6 / relativeScale, 2 / relativeScale)
          const padX = 10 / relativeScale
          const padY = 4 / relativeScale

          ctx.fillRect(
            box.left + padX,
            box.top + box.height / 2 - padY,
            box.width * 0.7,
            lineH
          )
          ctx.fillStyle = 'rgba(120, 120, 128, 0.1)'
        } else if (box.type === 'image') {
          ctx.strokeStyle = 'rgba(120, 120, 128, 0.3)'
          const size = Math.min(box.width, box.height) * 0.5
          const cx = box.left + box.width / 2
          const cy = box.top + box.height / 2
          ctx.strokeRect(cx - size / 2, cy - size / 2, size, size)
          ctx.strokeStyle = 'rgba(120, 120, 128, 0.14)'
        }
      }
    }
  }

  return {
    renderedVpt,
    isGesturing,
    minZoom,
    maxZoom,
    setRenderedVpt,
    fastBlit
  }
})