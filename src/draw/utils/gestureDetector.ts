import { Point } from 'fabric'

interface GestureDetectorOptions {
  onGestureStart?: () => void
  onZoom?: (scale: number, previousScale: number, center: Point) => void
  // UPDATED: Now provides frame-by-frame movement deltas, plus the total elapsed dx/dy
  onDrag?: (movementX: number, movementY: number, totalDx: number, totalDy: number, center: Point) => void
  onRotate?: (angleDifference: number, center: Point) => void
  onGestureEnd?: (fingers: number) => void
}

function calculateAngle(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  return (Math.atan2(dy, dx) * 180) / Math.PI
}

function normalizeAngle(angle: number): number {
  let newAngle = angle
  while (newAngle <= -180) newAngle += 360
  while (newAngle > 180) newAngle -= 360
  return newAngle
}

export function gestureDetector(el: HTMLElement, options: GestureDetectorOptions) {
  let initialDistance = 0
  let initialX = 0
  let initialY = 0

  let initialAngle = 0
  let previousAngle = 0
  let previousScale = 1

  // NEW: Track the center point of the previous frame
  let previousCenterX = 0
  let previousCenterY = 0

  let touch1Id: number | null = null
  let touch2Id: number | null = null

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      touch1Id = e.touches[0].identifier
      touch2Id = e.touches[1].identifier

      const x1 = e.touches[0].clientX
      const y1 = e.touches[0].clientY
      const x2 = e.touches[1].clientX
      const y2 = e.touches[1].clientY

      initialX = (x1 + x2) / 2
      initialY = (y1 + y2) / 2

      // Initialize previous center tracking
      previousCenterX = initialX
      previousCenterY = initialY

      previousScale = 1

      initialAngle = calculateAngle(x1, y1, x2, y2)
      previousAngle = initialAngle

      initialDistance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))

      if (options.onGestureStart) {
        options.onGestureStart()
      }
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault()

      let t1: Touch | undefined
      let t2: Touch | undefined

      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === touch1Id) t1 = e.touches[i]
        if (e.touches[i].identifier === touch2Id) t2 = e.touches[i]
      }

      if (!t1 || !t2) {
        t1 = e.touches[0]
        t2 = e.touches[1]
      }

      const x1 = t1.clientX
      const y1 = t1.clientY
      const x2 = t2.clientX
      const y2 = t2.clientY

      const currentX = (x1 + x2) / 2
      const currentY = (y1 + y2) / 2

      const center: any = {
        x: currentX,
        y: currentY
      }

      // NEW: Calculate the frame-by-frame delta
      const movementX = currentX - previousCenterX
      const movementY = currentY - previousCenterY

      // The total distance since the touch started
      const totalDx = currentX - initialX
      const totalDy = currentY - initialY

      const currentDistance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2))
      const scale = currentDistance / initialDistance

      const currentAngle = calculateAngle(x1, y1, x2, y2)
      const angleDifference = normalizeAngle(currentAngle - previousAngle)

      if (options.onRotate) {
        options.onRotate(angleDifference, center)
      }

      if (options.onZoom) {
        options.onZoom(scale, previousScale, center)
      }

      if (options.onDrag) {
        options.onDrag(movementX, movementY, totalDx, totalDy, center)
      }

      // Update previous values for the next frame
      previousAngle = currentAngle
      previousScale = scale
      previousCenterX = currentX
      previousCenterY = currentY
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (e.touches.length < 2) {
      touch1Id = null
      touch2Id = null
    }

    if (options.onGestureEnd) {
      options.onGestureEnd(e.touches.length)
    }
  }

  el.addEventListener('touchstart', onTouchStart, { passive: true })
  el.addEventListener('touchmove', onTouchMove, { passive: false })
  el.addEventListener('touchend', onTouchEnd, { passive: true })

  return {
    destroy() {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }
}