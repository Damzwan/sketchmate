import { Canvas } from 'fabric'
import { isCanvasHealthy } from '../helpers/healthChecker.helper'
import { EventBus } from '@/main'

export function useHealthChecker() {
  let c: Canvas | undefined
  let heartbeatInterval: ReturnType<typeof setInterval> | undefined
  let activityTimeout: ReturnType<typeof setTimeout> | undefined
  let isRecovering = false

  const events = ['undo', 'redo', 'add_to_undo_stack', 'saveDrawing']

  function performCheck() {
    if (!c || isRecovering) return

    if (!isCanvasHealthy(c)) {
      isRecovering = true
      console.error('CRITICAL: Canvas heartbeat lost!')
      stopMonitoring()
      EventBus.emit('trigger_canvas_recovery')
    }
  }

  function handleActivity() {
    if (activityTimeout) clearTimeout(activityTimeout)

    activityTimeout = setTimeout(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => performCheck(), { timeout: 1000 })
      } else {
        performCheck()
      }
    }, 300)
  }

  function startMonitoring(canvas: Canvas) {
    c = canvas
    isRecovering = false

    events.forEach(e => {
      EventBus.off(e, handleActivity)
      EventBus.on(e, handleActivity)
    })

    heartbeatInterval = setInterval(() => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => performCheck(), { timeout: 1000 })
      } else {
        performCheck()
      }
    }, 10000)
  }

  function stopMonitoring() {
    events.forEach(e => {
      EventBus.off(e, handleActivity)
    })

    if (activityTimeout) clearTimeout(activityTimeout)
    if (heartbeatInterval) clearInterval(heartbeatInterval)

    c = undefined
  }

  return { startMonitoring, stopMonitoring }
}