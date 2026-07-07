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
    <div class="h-full flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden"
         @touchmove.stop>

      <div class="shrink-0 pt-2 mb-6 text-center relative">
        <div class="absolute right-0 top-0 flex items-center gap-1">
          <ion-button
            fill="clear"
            color="dark"
            class="ion-no-margin"
            :disabled="strokes.length === 0"
            @click="undo"
          >
            <ion-icon slot="icon-only" :icon="svg(mdiUndoVariant)" class="text-xl" />
          </ion-button>

          <ion-button fill="clear" color="dark" class="ion-no-margin" @click="handleDismiss">
            <ion-icon slot="icon-only" :icon="svg(mdiClose)" class="text-xl" />
          </ion-button>
        </div>

        <h1 class="text-4xl text-secondary font-black tracking-tighter italic leading-none">
          Signature
        </h1>
        <p class="font-bold uppercase tracking-widest mt-1.5">
          Leave your mark
        </p>
      </div>

      <div
        ref="padRef"
        class="flex-1 w-full bg-tertiary border border-primary/40 rounded-[2.5rem] touch-none relative overflow-hidden shadow-sm cursor-crosshair group"
        style="min-height: 280px;"
        @pointerdown.prevent="startStroke"
        @pointermove.prevent="draw"
        @pointerup.prevent="endStroke"
        @pointercancel.prevent="endStroke"
        @pointerout.prevent="endStroke"
      >
        <div class="absolute inset-0 opacity-[0.03] pointer-events-none"
             style="background-image: radial-gradient(#000 1px, transparent 1px); background-size: 20px 20px;">
        </div>

        <svg
          class="w-full h-full pointer-events-none relative z-10"
          :viewBox="`0 0 ${padWidth} ${padHeight}`"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
        >
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
          <path
            v-if="currentStroke.length >= 1"
            :d="buildPath(currentStroke)"
            fill="none"
            :stroke="color"
            stroke-width="5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>

        <transition name="fade">
          <div
            v-if="strokes.length === 0 && currentStroke.length === 0"
            class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none gap-3"
          >
            <div class="w-16 h-16 rounded-full bg-secondary/5 flex items-center justify-center">
              <ion-icon :icon="svg(mdiLeadPencil)" class="text-4xl opacity-20" />
            </div>
            <span class="text-sm font-black text-black/20 tracking-widest uppercase">Sign inside the lines</span>
          </div>
        </transition>
      </div>

      <div class="flex flex-col gap-2 mt-6 shrink-0 pb-2">
        <p
          v-if="!isPro"
          class="text-center text-[11px] font-bold text-secondary/70 uppercase tracking-wider flex items-center justify-center gap-1"
        >
          <ion-icon :icon="svg(mdiLock)" class="text-xs" />
          Signatures are available with Pro
        </p>

        <div class="grid grid-cols-2 gap-3">
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
            @click="applyOrUpgrade"
          >
            <div class="flex items-center justify-center gap-2">
              <template v-if="isPro">
                <span>Apply</span>
                <ion-icon :icon="svg(mdiCheck)" class="text-base" />
              </template>

              <template v-else>
                <ion-icon :icon="svg(mdiLock)" class="text-base" />
                <span>Unlock Pro</span>
              </template>
            </div>
          </ion-button>
        </div>
      </div>

    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, nextTick, computed } from 'vue'
import { IonModal, IonButton, IonIcon } from '@ionic/vue'
import { mdiCheck, mdiClose, mdiLeadPencil, mdiLock, mdiUndoVariant } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { useSubscriptionStore } from '@/store/subscription.store'

type Point = [number, number];

const props = defineProps<{ isOpen: boolean; color: string }>()
const emit = defineEmits(['close', 'save'])

const subscriptionStore = useSubscriptionStore()
const isPro = computed(() => subscriptionStore.isPro)

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
    Number(((e.clientX - rect.left) * scaleX).toFixed(1)),
    Number(((e.clientY - rect.top) * scaleY).toFixed(1))
  ]
}

const presentPaywall = () => {
  subscriptionStore.presentPaywall();
};

const applyOrUpgrade = () => {
  if (!isPro.value) {
    presentPaywall();
    return;
  }

  save();
};

const startStroke = (e: PointerEvent) => {
  if (!padRef.value) return
  padRef.value.setPointerCapture(e.pointerId)
  isDrawing.value = true
  currentStroke.value = [getPoint(e)]
}

const draw = (e: PointerEvent) => {
  if (!isDrawing.value) return

  const newPoint = getPoint(e)
  const lastPoint = currentStroke.value[currentStroke.value.length - 1]

  if (lastPoint) {
    const dx = newPoint[0] - lastPoint[0]
    const dy = newPoint[1] - lastPoint[1]
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < 2) return
  }

  currentStroke.value.push(newPoint)
}


const endStroke = (e: PointerEvent) => {
  if (!isDrawing.value) return
  isDrawing.value = false
  padRef.value?.releasePointerCapture(e.pointerId)

  if (currentStroke.value.length === 1) {
    // Saves standalone points/taps
    strokes.value.push([currentStroke.value[0]])
  } else if (currentStroke.value.length > 1) {
    const optimizedStroke = simplifyPath(currentStroke.value, 1.5)
    strokes.value.push(optimizedStroke)
  }
  currentStroke.value = []
}

function getSqSegDist(p: Point, p1: Point, p2: Point): number {
  let x = p1[0],
    y = p1[1],
    dx = p2[0] - x,
    dy = p2[1] - y
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)
    if (t > 1) {
      x = p2[0]
      y = p2[1]
    } else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }
  dx = p[0] - x
  dy = p[1] - y
  return dx * dx + dy * dy
}

function simplifyDPStep(
  points: Point[],
  first: number,
  last: number,
  sqTolerance: number,
  simplified: Point[]
) {
  let maxSqDist = sqTolerance,
    index = -1
  for (let i = first + 1; i < last; i++) {
    const sqDist = getSqSegDist(points[i], points[first], points[last])
    if (sqDist > maxSqDist) {
      index = i
      maxSqDist = sqDist
    }
  }
  if (index > -1) {
    if (index - first > 1)
      simplifyDPStep(points, first, index, sqTolerance, simplified)
    simplified.push(points[index])
    if (last - index > 1)
      simplifyDPStep(points, index, last, sqTolerance, simplified)
  }
}

function simplifyPath(points: Point[], tolerance = 1.5): Point[] {
  if (points.length <= 2) return points
  const sqTolerance = tolerance * tolerance
  const simplified: Point[] = [points[0]]
  simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified)
  simplified.push(points[points.length - 1])
  return simplified
}

const buildPath = (points: Point[]): string => {
  if (points.length === 0) return ''
  if (points.length === 1) {
    const [x, y] = points[0]
    return `M${x},${y} L${x},${y}`
  }

  const d: string[] = []
  d.push(`M${points[0][0]},${points[0][1]}`)

  for (let i = 1; i < points.length - 1; i++) {
    const midX = Number(((points[i][0] + points[i + 1][0]) / 2).toFixed(1))
    const midY = Number(((points[i][1] + points[i + 1][1]) / 2).toFixed(1))
    d.push(`Q${points[i][0]},${points[i][1]} ${midX},${midY}`)
  }

  const last = points[points.length - 1]
  d.push(`L${last[0]},${last[1]}`)

  return d.join('')
}

const undo = () => {
  strokes.value.pop()
}

const clear = () => {
  strokes.value = []
  currentStroke.value = []
}

const save = () => {
  if (!isPro.value) return
  if (strokes.value.length === 0) return

  const combinedPath = strokes.value.map(buildPath).join(' ')
  const viewBox = `0 0 ${padWidth.value} ${padHeight.value}`

  const encoder = new TextEncoder()
  const pathBytes = encoder.encode(combinedPath).length
  console.log(`Signature Path Size: ${(pathBytes / 1024).toFixed(2)} KB`)

  emit('save', {
    path: combinedPath,
    viewBox: viewBox
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