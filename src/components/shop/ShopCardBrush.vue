<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-32 bg-gradient-to-br from-zinc-50 to-zinc-100 relative flex items-center justify-center">
        <canvas ref="canvasEl" class="max-w-full"></canvas>

        <!-- Brush icon corner badge -->
        <div class="absolute top-3 right-3 w-10 h-10 rounded-full bg-white shadow-md flex items-center justify-center">
          <ion-icon :icon="svg(brushIcon)" class="text-xl text-[#3d1a14]" />
        </div>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { onMounted, ref, computed, nextTick } from 'vue'
import { IonIcon } from '@ionic/vue'
import { Canvas, Point } from 'fabric'
import type { ShopSku } from '@/config/catalog.config'
import { BrushType } from '@/draw/types/draw.types'
import { penBrushMapping, penIconMapping } from '@/draw/config/tools.config'
import { svg } from '@/helper/general.helper'
import ShopCardShell from './ShopCardShell.vue'

const props = defineProps<{
  sku: ShopSku
  owned: boolean
  highlight?: boolean
}>()

defineEmits(['purchase'])

const canvasEl = ref<HTMLCanvasElement | null>(null)

// Map sku.refId → BrushType enum
const brushType = computed<BrushType>(() => {
  switch (props.sku.refId) {
    case 'neon':
      return BrushType.Neon
    case 'calligraphy':
      return BrushType.CalliGraphy
    default:
      return BrushType.Pencil
  }
})

const brushIcon = computed(() => penIconMapping[brushType.value])

// Render a single wavy stroke in this brush's style. Same technique as
// PenMenu's renderPreview but at a fixed shop-card size.
onMounted(async () => {
  await nextTick()
  if (!canvasEl.value) return

  const canvas = new Canvas(canvasEl.value, {
    width: 200,
    height: 90,
    selection: false
  })
  canvas.backgroundColor = 'rgba(0,0,0,0)'

  try {
    canvas.freeDrawingBrush = penBrushMapping[brushType.value](canvas)
    const brush = canvas.freeDrawingBrush as any
    brush.color = '#3d1a14'
    brush.width = brushType.value === BrushType.CalliGraphy ? 8 : 4

    const amplitude = 12
    const frequency = 0.06
    const yOffset = 45

    const pts = [[10, yOffset]]
    for (let x = 20; x <= 190; x += 8) {
      pts.push([x, yOffset + amplitude * Math.sin(frequency * x)])
    }
    const points = pts.map((p) => new Point(p[0], p[1]))

    brush.onMouseDown(points[0], { e: new MouseEvent('mousedown') })
    for (let i = 1; i < points.length; i++) {
      brush.onMouseMove(points[i], { e: new MouseEvent('mousemove') })
    }
    brush.onMouseUp({ e: new MouseEvent('mouseup') })

    canvas.getObjects().forEach((o) => o.set('selectable', false))
    canvas.renderAll()
  } catch (e) {
    console.warn('[ShopCardBrush] preview render failed', e)
  }
})
</script>