<template>
  <ion-popover
    :is-open="eraserMenuOpen"
    :event="menuEvent"
    @didDismiss="close"
    :keepContentsMounted="true"
    :showBackdrop="false"
    class="eraser-popover"
    side="top" alignment="center"
  >
    <div class="eraser-shell bg-tertiary border border-primary/20">
      <div class="eraser-body hide-scrollbar">

        <div class="control_card shadow-sm">
          <div>
            <div class="control_row">
              <label class="control_label">Eraser Size</label>
              <span class="value_pill">{{ eraserSize }}</span>
            </div>
            <ion-range
              aria-label="Eraser Size"
              v-model="eraserSize"
              :min="0.5"
              :step="0.5"
              :max="150"
              color="secondary"
            />
          </div>

          <div class="card_divider"></div>

          <button class="action_button" @click="clearAll">
            <ion-icon :icon="svg(mdiNuke)" class="text-lg" />
            <span>Clear all</span>
          </button>
        </div>

      </div>
    </div>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonIcon, IonPopover, IonRange } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'
import { svg } from '@/helper/general.helper'
import { mdiNuke } from '@mdi/js'
import { DrawAction, DrawTool, EraserSize } from '@/draw/types/draw.types'
import { useMenuStore } from '@/store/menu.store'
import { useEraser } from '@/draw/store/tools/eraser.store'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'

const drawStore = useDrawStore()
const { selectTool } = useToolSelection()
const { eraserSize } = storeToRefs(useEraser())
const { eraserMenuOpen, menuEvent } = storeToRefs(useMenuStore())

function clearAll() {
  drawStore.selectAction(DrawAction.FullErase, undefined)
  close()
}

function selectEraserSize(size: EraserSize) {
  eraserSize.value = size
}

function selectEraser() {
  selectTool(DrawTool.MobileEraser)
  close()
}

function close() {
  eraserMenuOpen.value = false
}
</script>

<style scoped>
@reference "@/theme/main.css";

.eraser-popover {
  --border-radius: 26px;
  --box-shadow: 0 24px 64px -18px rgba(0, 0, 0, 0.25);
  --width: 296px;
}

.eraser-popover::part(content) {
  border-radius: 26px;
  overflow: hidden;
}

.eraser-shell {
  display: flex;
  flex-direction: column;
  max-height: min(85vh, 640px);
}

.eraser-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  @apply p-3;
}

.control_card {
  @apply bg-background border border-primary/20 rounded-[1.75rem] p-4 space-y-3;
}

.card_divider {
  @apply h-px bg-primary/10 my-1;
}

.control_row {
  @apply flex items-center justify-between mb-0.5;
}

.control_label {
  @apply block text-[11px] font-black uppercase tracking-widest text-black/40;
}

.value_pill {
  @apply text-[11px] font-black text-secondary bg-secondary/10 px-2 py-0.5 rounded-full tabular-nums;
}

.action_button {
  @apply w-full flex items-center justify-center gap-2 py-2.5 mt-1 rounded-2xl
  bg-red-500/10 text-red-500 font-bold text-sm
  active:scale-95 transition-transform cursor-pointer border-0;
}

ion-range {
  --bar-height: 4px;
  --bar-border-radius: 8px;
  --bar-background: rgba(0, 0, 0, 0.08);
  --bar-background-active: var(--ion-color-secondary);
  --knob-size: 18px;
  --knob-background: #fff;
  --knob-box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);
  padding: 4px 2px;
}

.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>