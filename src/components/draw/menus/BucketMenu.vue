<template>
  <ion-popover
    :is-open="bucketMenuOpen"
    :event="menuEvent"
    @didDismiss="onDismiss"
    :keepContentsMounted="true"
    :showBackdrop="false"
    class="bucket-popover"
    side="top" alignment="center"
  >
    <div class="bucket-shell bg-tertiary border border-primary/20">

      <!-- ─── Fixed fill preview ─────────────────────────────────────── -->
      <div class="bucket-preview">
        <div class="preview-stage border border-primary/10">
          <div class="fill-chip" :style="{ backgroundColor: previewColor }" />
          <span class="preview-tag">Fill</span>
        </div>
      </div>

      <!-- ─── Scrolling body ─────────────────────────────────────────── -->
      <div class="bucket-body hide-scrollbar">
        <div class="control_card shadow-sm">
          <div>
            <div class="control_row">
              <label class="control_label">Fill Opacity</label>
              <span class="value_pill">{{ opacity }}%</span>
            </div>
            <ion-range aria-label="Fill opacity" v-model="opacity"
                       :min="0" :max="100" color="secondary" />
          </div>
        </div>

        <ColorPicker v-model:color="brushColor" :reset="bucketMenuOpen" />
      </div>
    </div>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonPopover, IonRange } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useMenuStore } from '@/store/menu.store'
import ColorPicker from '@/components/draw/ColorPicker.vue'
import { usePen } from '@/draw/store/tools/pen.store'
import { hexWithOpacity, percentToAlphaHex } from '@/draw/utils/color.utils'

const { bucketMenuOpen, menuEvent } = storeToRefs(useMenuStore())
const { brushColor, opacity } = storeToRefs(usePen())

const previewColor = computed(() =>
  hexWithOpacity(brushColor.value, percentToAlphaHex(opacity.value))
)

function onDismiss() {
  bucketMenuOpen.value = false
}
</script>

<style scoped>
@reference "@/theme/main.css";

.bucket-popover {
  --border-radius: 26px;
  --backdrop-opacity: 0;
  --background: transparent;
  --box-shadow: 0 24px 64px -18px rgba(0, 0, 0, 0.25);
  --width: 296px;
}

.bucket-popover::part(content) {
  border-radius: 26px;
  overflow: hidden;
}

.bucket-shell {
  display: flex;
  flex-direction: column;
  max-height: min(85vh, 640px);
}

.bucket-preview {
  flex: 0 0 auto;
  @apply p-3 pb-0;
}

.preview-stage {
  @apply relative rounded-2xl overflow-hidden shadow-inner;
}

.fill-chip {
  @apply w-full h-16;
  background-image:
    linear-gradient(45deg, rgba(0,0,0,0.06) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(0,0,0,0.06) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.06) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.06) 75%);
  background-size: 14px 14px;
  background-position: 0 0, 0 7px, 7px -7px, -7px 0;
}

.preview-tag {
  @apply absolute top-1.5 left-2 px-1.5 py-0.5 rounded-full bg-black/35 backdrop-blur-sm
  text-[8px] font-black uppercase tracking-widest text-white/80 pointer-events-none;
}

.bucket-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  @apply p-3 space-y-3;
}

.control_card {
  @apply bg-background border border-primary/20 rounded-[1.75rem] p-4 space-y-3;
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