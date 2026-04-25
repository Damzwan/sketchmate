<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted, nextTick } from 'vue'

interface GhostBox {
  id: string | number;
  left: number;
  top: number;
  width: number;
  height: number;
  type?: string;
}

const props = defineProps<{
  isGesturing: boolean;
  cssTransform: { translateX: number; translateY: number; scale: number };
  ghostBoxes: GhostBox[];
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
let rafId: number | null = null

// Sync canvas resolution with display size
const syncCanvasSize = () => {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()

  // Set internal resolution
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
}

const draw = () => {
  if (!canvasRef.value || !props.isGesturing) return
  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)

  ctx.save()

  ctx.scale(dpr, dpr)
  ctx.translate(props.cssTransform.translateX, props.cssTransform.translateY)
  ctx.scale(props.cssTransform.scale, props.cssTransform.scale)

  const globalAlpha = 0.6 + Math.sin(Date.now() / 300) * 0.3
  ctx.globalAlpha = globalAlpha

  ctx.fillStyle = 'rgba(120, 120, 128, 0.1)'
  ctx.strokeStyle = 'rgba(120, 120, 128, 0.14)'

  // 🚨 HIGH-DENSITY EMERGENCY MODE
  if (props.ghostBoxes.length > 200) {
    ctx.beginPath()
    for (const box of props.ghostBoxes) {
      // Standard rect is significantly faster than roundRect
      ctx.rect(box.left, box.top, box.width, box.height)
    }
    ctx.fill()
    ctx.stroke()
  }
  // 🟢 NORMAL MODE
  else {
    for (const box of props.ghostBoxes) {
      ctx.beginPath()
      ctx.roundRect(box.left, box.top, box.width, box.height, 8)
      ctx.fill()
      ctx.stroke()

      if (box.type?.includes('text')) {
        drawText(ctx, box)
        ctx.fillStyle = 'rgba(120, 120, 128, 0.1)'
      } else if (box.type === 'image') {
        drawImage(ctx, box)
        ctx.strokeStyle = 'rgba(120, 120, 128, 0.14)'
      }
    }
  }

  ctx.restore()
  rafId = requestAnimationFrame(draw)
}

function drawText(ctx: CanvasRenderingContext2D, box: GhostBox) {
  ctx.fillStyle = 'rgba(120, 120, 128, 0.28)'
  const lineH = 6 / props.cssTransform.scale // scale lines so they don't look huge when zoomed
  ctx.fillRect(box.left + 10, box.top + box.height / 2 - 4, box.width * 0.7, Math.max(lineH, 2))
}

function drawImage(ctx: CanvasRenderingContext2D, box: GhostBox) {
  ctx.strokeStyle = 'rgba(120, 120, 128, 0.3)'
  const size = Math.min(box.width, box.height) * 0.5
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  ctx.strokeRect(cx - size / 2, cy - size / 2, size, size)
}

// Watchers and Lifecycle
watch(() => props.isGesturing, async (val) => {
  if (val) {
    await nextTick()
    syncCanvasSize()
    rafId = requestAnimationFrame(draw)
  } else if (rafId) {
    cancelAnimationFrame(rafId)
  }
})

// Handle window resizing
onMounted(() => window.addEventListener('resize', syncCanvasSize))
onUnmounted(() => {
  window.removeEventListener('resize', syncCanvasSize)
  if (rafId) cancelAnimationFrame(rafId)
})
</script>

<template>
  <div ref="containerRef" class="ghost-root">
    <Transition name="ghost-fade">
      <canvas
        v-show="isGesturing"
        ref="canvasRef"
        class="ghost-canvas"
      />
    </Transition>
  </div>
</template>

<style scoped>
.ghost-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5; /* Ensure it's above the main canvas if needed */
  overflow: hidden;
}

.ghost-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.ghost-fade-enter-active, .ghost-fade-leave-active {
  transition: opacity 0.2s;
}

.ghost-fade-enter-from, .ghost-fade-leave-to {
  opacity: 0;
}
</style>