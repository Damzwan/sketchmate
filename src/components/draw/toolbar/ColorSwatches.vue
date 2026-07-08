<template>
  <!-- Rendered inside the draw page (NOT teleported to body) so it lives in the
       page's stacking context and stays UNDER SendHub / RoomMenu / ChatWidget
       instead of floating above them. pointer-events-auto re-enables taps since
       the Toolbars wrapper is pointer-events-none. -->
  <div
    v-show="enabled"
    class="fixed z-40 flex flex-col gap-2 pointer-events-auto"
    :style="{
      right: 'calc(0.75rem + env(safe-area-inset-right))',
      bottom: 'calc(9rem + env(safe-area-inset-bottom))',
    }"
  >
      <button
        v-for="(p, i) in profiles"
        :key="i"
        class="relative w-[38px] h-[38px] cursor-pointer rounded-2xl border shadow-lg overflow-hidden transition-all active:scale-95"
        :class="i === activeIndex
          ? 'border-secondary ring-2 ring-secondary/60 scale-105'
          : 'border-primary/60'"
        :aria-label="`Color ${i + 1}`"
        @click="onClick(i, $event)"
      >
        <!-- checkerboard base so low-opacity colors read correctly -->
        <span class="absolute inset-0 checker" />
        <span class="absolute inset-0" :style="{ backgroundColor: swatchCss(p) }" />
      </button>
    </div>

    <ion-popover
      :is-open="pickerOpen"
      :event="pickerEvent"
      :keep-contents-mounted="true"
      :show-backdrop="false"
      side="top"
      alignment="end"
      @didDismiss="pickerOpen = false"
    >
      <div class="swatch_menu bg-background">
        <div class="opacity_row">
          <div class="flex items-center justify-between mb-0.5">
            <label class="opacity_label">Opacity</label>
            <span class="value_pill">{{ opacity }}%</span>
          </div>
          <ion-range aria-label="Opacity" v-model="opacity" :min="0" :max="100" color="secondary" />
        </div>
        <ColorPicker v-model:color="brushColor" :reset="pickerOpen" />
      </div>
    </ion-popover>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { IonPopover, IonRange } from '@ionic/vue'
import ColorPicker from '@/components/draw/ColorPicker.vue'
import { useColorProfiles, type ColorProfile } from '@/draw/store/tools/colorProfiles.store'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { usePen } from '@/draw/store/tools/pen.store'
import { DrawTool } from '@/draw/types/draw.types'
import { hexWithOpacity, percentToAlphaHex } from '@/draw/utils/color.utils'

const { profiles, activeIndex } = storeToRefs(useColorProfiles())
const { setActive } = useColorProfiles()
const { selectedTool } = storeToRefs(useToolSelection())
const { brushColor, opacity } = storeToRefs(usePen())

const pickerOpen = ref(false)
const pickerEvent = ref<Event | undefined>(undefined)

const enabled = computed(
  () =>
    selectedTool.value === DrawTool.Pen ||
    selectedTool.value === DrawTool.Bucket
)

function swatchCss(p: ColorProfile) {
  return hexWithOpacity(p.color, percentToAlphaHex(p.opacity))
}

function onClick(i: number, e: MouseEvent) {
  // First click switches to the slot; only a second click on the ALREADY-active
  // slot opens the color picker (not the full pen/bucket menu).
  if (i !== activeIndex.value) {
    setActive(i)
    return
  }
  pickerEvent.value = e
  pickerOpen.value = true
}
</script>

<style scoped>
@reference "@/theme/main.css";

.swatch_menu {
  @apply p-3 space-y-3 w-[260px];
}

.opacity_row {
  @apply bg-background border border-primary/20 rounded-2xl p-3;
}

.opacity_label {
  @apply block text-[11px] font-black uppercase tracking-widest text-black/40;
}

.value_pill {
  @apply text-[11px] font-black text-secondary bg-secondary/10 px-2 py-0.5 rounded-full tabular-nums;
}

.checker {
  background-image:
    linear-gradient(45deg, rgba(0, 0, 0, 0.12) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(0, 0, 0, 0.12) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(0, 0, 0, 0.12) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(0, 0, 0, 0.12) 75%);
  background-size: 10px 10px;
  background-position: 0 0, 0 5px, 5px -5px, -5px 0;
  background-color: #fff;
}
</style>
