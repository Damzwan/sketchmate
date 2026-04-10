<template>
  <div
    v-if="uiStore.isMiniMapOpen"
    ref="el"
    class="fixed z-[9999] bg-white rounded-xl shadow-2xl select-none touch-none overflow-hidden"
    :style="style"
  >
    <div
      ref="handle"
      class="flex items-center justify-between px-3 py-2.5 bg-primary border-b cursor-grab active:cursor-grabbing"
    >
      <div class="flex items-center pointer-events-none text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
        <span class="mr-2 text-sm text-gray-400">⠿</span> MINIMAP
      </div>

      <button
        class="flex items-center justify-center w-8 h-8 -mr-1 text-gray-400 transition-colors rounded-md hover:text-red-500 hover:bg-black/5 active:bg-black/10"
        @click.stop="uiStore.isMiniMapOpen = false"
        @mousedown.stop
        @touchstart.stop
      >
        <span class="text-xs font-bold">✕</span>
      </button>
    </div>

    <canvas
      ref="minimapRef"
      width="200"
      height="150"
      class="block cursor-crosshair"
      @mousedown="onMinimapMouseDown"
      @touchstart.passive="onMinimapMouseDown"
    ></canvas>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount, watch, onMounted } from 'vue'
import { useDraggable, useThrottleFn } from '@vueuse/core'
import { useDrawStore } from '@/draw/store/draw.store.ts'
import { useDrawUIStore } from '@/draw/store/drawUI.store.ts'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store.ts'

const uiStore = useDrawUIStore()
const minimapRef = ref(null)
const el = ref(null)
const handle = ref(null)

const { x, y, style } = useDraggable(el, {
  initialValue: { x: window.innerWidth - 220, y: 140 },
  handle: handle
})

const mapState = {
  minX: 0, minY: 0, scale: 1, offsetX: 0, offsetY: 0
}

// --- RENDERING CORE ---
const updateMinimap = () => {
  if (!minimapRef.value || !uiStore.isMiniMapOpen) return

  const { getCanvas } = useDrawStore()
  const canvas = getCanvas()
  if (!canvas) return

  const ctx = minimapRef.value.getContext('2d', { alpha: false })
  const { width, height } = minimapRef.value

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  const objects = canvas.getObjects()
  if (objects.length === 0) return

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  objects.forEach(obj => {
    const bound = obj.getBoundingRect(true)
    minX = Math.min(minX, bound.left)
    minY = Math.min(minY, bound.top)
    maxX = Math.max(maxX, bound.left + bound.width)
    maxY = Math.max(maxY, bound.top + bound.height)
  })

  const padding = 150
  minX -= padding; minY -= padding; maxX += padding; maxY += padding

  const worldWidth = maxX - minX
  const worldHeight = maxY - minY
  const scale = Math.min(width / worldWidth, height / worldHeight) || 1

  mapState.offsetX = (width - worldWidth * scale) / 2
  mapState.offsetY = (height - worldHeight * scale) / 2
  mapState.scale = scale
  mapState.minX = minX
  mapState.minY = minY

  ctx.save()
  ctx.translate(mapState.offsetX, mapState.offsetY)
  ctx.scale(scale, scale)
  ctx.translate(-minX, -minY)

  const originalSkip = canvas.skipOffscreen
  canvas.skipOffscreen = false

  objects.forEach(obj => {
    const wasVisible = obj.visible
    obj.visible = true
    obj.render(ctx)
    obj.visible = wasVisible
  })

  canvas.skipOffscreen = originalSkip

  if (canvas.vptCoords) {
    const { tl, br } = canvas.vptCoords
    ctx.fillStyle = 'rgba(0, 123, 255, 0.15)'
    ctx.strokeStyle = '#007bff'
    ctx.lineWidth = 3 / scale
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y)
    ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y)
  }
  ctx.restore()
}

// --- NAVIGATION (THROTTLED) ---
let navRaf = null
const navigateTo = (clientX, clientY) => {
  if (navRaf) cancelAnimationFrame(navRaf)

  navRaf = requestAnimationFrame(() => {
    const { getCanvas } = useDrawStore()
    const canvas = getCanvas()
    if (!canvas || !minimapRef.value) return

    const rect = minimapRef.value.getBoundingClientRect()
    const clickX = clientX - rect.left
    const clickY = clientY - rect.top

    const worldX = (clickX - mapState.offsetX) / mapState.scale + mapState.minX
    const worldY = (clickY - mapState.offsetY) / mapState.scale + mapState.minY

    const zoom = canvas.getZoom()
    const vpt = canvas.viewportTransform
    vpt[4] = (canvas.width / 2) - (worldX * zoom)
    vpt[5] = (canvas.height / 2) - (worldY * zoom)

    canvas.requestRenderAll()
    const { updateVisibility } = useDrawObjectManager()
    updateVisibility()
  })
}

const throttledMouseMove = useThrottleFn((e) => {
  const touch = e.touches ? e.touches[0] : e
  navigateTo(touch.clientX, touch.clientY)
}, 32)

const onMinimapMouseDown = (e) => {
  const touch = e.touches ? e.touches[0] : e
  navigateTo(touch.clientX, touch.clientY)

  const moveEvent = e.touches ? 'touchmove' : 'mousemove'
  const upEvent = e.touches ? 'touchend' : 'mouseup'

  window.addEventListener(moveEvent, throttledMouseMove)
  window.addEventListener(upEvent, () => {
    window.removeEventListener(moveEvent, throttledMouseMove)
  }, { once: true })
}

// --- LIFECYCLE & WATCHERS ---
const setupListeners = (active) => {
  const { getCanvas } = useDrawStore()
  const c = getCanvas()
  if (!c) return

  if (active) {
    c.on('after:render', throttledUpdate)
    // Small delay to ensure the canvas ref is available in DOM for initial render
    setTimeout(() => updateMinimap(), 0)
  } else {
    c.off('after:render', throttledUpdate)
  }
}

watch(() => uiStore.isMiniMapOpen, (newVal) => {
  setupListeners(newVal)
})

let throttleTimer = null
const throttledUpdate = () => {
  if (throttleTimer) return
  throttleTimer = setTimeout(() => {
    updateMinimap()
    throttleTimer = null
  }, 100)
}

onMounted(() => {
  if (uiStore.isMiniMapOpen) setupListeners(true)
})

onBeforeUnmount(() => {
  setupListeners(false)
  if (navRaf) cancelAnimationFrame(navRaf)
})
</script>