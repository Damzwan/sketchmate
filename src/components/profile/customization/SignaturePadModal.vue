<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    @will-present="measurePad"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-signature-modal"
  >
    <div class="h-full flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden" @touchmove.stop>

      <!-- Header Section -->
      <div class="shrink-0 pt-2 mb-6 text-center relative">
        <div class="absolute right-0 top-0">
          <ion-button fill="clear" color="dark" class="ion-no-margin" @click="handleDismiss">
            <ion-icon slot="icon-only" :icon="svg(mdiClose)" class="text-xl" />
          </ion-button>
        </div>

        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          Signature
        </h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-2">
          Leave your mark
        </p>
      </div>

      <!-- Drawing Canvas Area -->
      <div
        ref="padRef"
        class="flex-1 w-full bg-white/60 border-2 border-white rounded-[2.5rem] touch-none relative overflow-hidden shadow-sm backdrop-blur-md cursor-crosshair group"
        style="min-height: 280px;"
        @pointerdown.prevent="startStroke"
        @pointermove.prevent="draw"
        @pointerup.prevent="endStroke"
        @pointercancel.prevent="endStroke"
      >
        <!-- Decorative grid pattern background for that "sketchbook" feel -->
        <div class="absolute inset-0 opacity-[0.03] pointer-events-none"
             style="background-image: radial-gradient(#000 1px, transparent 1px); background-size: 20px 20px;">
        </div>

        <svg
          class="w-full h-full pointer-events-none relative z-10"
          :viewBox="`0 0 ${padWidth} ${padHeight}`"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- Completed strokes -->
          <path
            v-for="(stroke, i) in strokes"
            :key="i"
            :d="buildPath(stroke)"
            fill="none"
            :stroke="color"
            stroke-width="5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <!-- Stroke in progress -->
          <path
            v-if="currentStroke.length > 1"
            :d="buildPath(currentStroke)"
            fill="none"
            :stroke="color"
            stroke-width="5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>

        <!-- Placeholder text -->
        <transition name="fade">
          <div
            v-if="strokes.length === 0 && currentStroke.length === 0"
            class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none gap-3"
          >
            <div class="w-16 h-16 rounded-full bg-secondary/5 flex items-center justify-center">
              <span class="text-4xl opacity-20">✍️</span>
            </div>
            <span class="text-sm font-black text-black/20 tracking-widest uppercase">Sign inside the lines</span>
          </div>
        </transition>
      </div>

      <!-- Action buttons -->
      <div class="grid grid-cols-2 gap-3 mt-6 shrink-0 pb-2">
        <ion-button
          fill="clear"
          color="dark"
          size="large"
          :disabled="strokes.length === 0"
          @click="clear"
        >
          Clear
        </ion-button>
        <ion-button
          color="secondary"
          shape="round"
          size="large"
          :disabled="strokes.length === 0"
          @click="save"
        >
          Apply ✓
        </ion-button>
      </div>

    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { IonModal, IonButton, IonIcon } from '@ionic/vue'
import { mdiClose } from '@mdi/js'
import { svg } from '@/helper/general.helper'

type Point = [number, number]

const props = defineProps<{ isOpen: boolean; color: string }>()
const emit = defineEmits(['close', 'save'])

const padRef = ref<HTMLElement | null>(null)
const padWidth = ref(300)
const padHeight = ref(200)

const measurePad = async () => {
  await nextTick()
  if (padRef.value) {
    padWidth.value = padRef.value.clientWidth || 300
    padHeight.value = padRef.value.clientHeight || 280
  }
}

const strokes = ref<Point[][]>([])
const currentStroke = ref<Point[]>([])
const isDrawing = ref(false)

const getPoint = (e: PointerEvent): Point => {
  const rect = padRef.value!.getBoundingClientRect()
  const scaleX = padWidth.value / rect.width
  const scaleY = padHeight.value / rect.height
  return [
    (e.clientX - rect.left) * scaleX,
    (e.clientY - rect.top) * scaleY
  ]
}

const startStroke = (e: PointerEvent) => {
  if (!padRef.value) return
  padRef.value.setPointerCapture(e.pointerId)
  isDrawing.value = true
  currentStroke.value = [getPoint(e)]
}

const draw = (e: PointerEvent) => {
  if (!isDrawing.value) return
  currentStroke.value = [...currentStroke.value, getPoint(e)]
}

const endStroke = (e: PointerEvent) => {
  if (!isDrawing.value) return
  isDrawing.value = false
  padRef.value?.releasePointerCapture(e.pointerId)
  if (currentStroke.value.length > 1) {
    strokes.value = [...strokes.value, currentStroke.value]
  }
  currentStroke.value = []
}

const buildPath = (points: Point[]): string => {
  if (points.length < 2) return ''
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`
  }
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i][0] + points[i + 1][0]) / 2
    const midY = (points[i][1] + points[i + 1][1]) / 2
    d += ` Q ${points[i][0]} ${points[i][1]} ${midX} ${midY}`
  }
  const last = points[points.length - 1]
  d += ` L ${last[0]} ${last[1]}`
  return d
}

const clear = () => {
  strokes.value = []
  currentStroke.value = []
}

const save = () => {
  if (strokes.value.length === 0) return
  const combinedPath = strokes.value.map(buildPath).join(' ')
  emit('save', {
    path: combinedPath,
    viewBox: `0 0 ${padWidth.value} ${padHeight.value}`
  })
  clear()
}

const handleDismiss = () => {
  clear()
  emit('close')
}
</script>

<style scoped>
ion-modal.liquid-signature-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto;
  --max-height: 96vh;
  --background: var(--ion-color-tertiary);
}

ion-modal.liquid-signature-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>