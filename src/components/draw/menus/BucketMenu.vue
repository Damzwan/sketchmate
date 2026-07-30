<template>
  <ion-popover
    :is-open="bucketMenuOpen"
    :event="menuEvent"
    @didDismiss="onDismiss"
    :keepContentsMounted="true"
    :showBackdrop="false"
    class="draw-menu-popover"
    side="top" alignment="center"
  >
    <div class="draw-menu bg-tertiary border border-primary/20">

      <!-- Fill swatch and its opacity read as one unit, so they share a card
           instead of the swatch sitting in a separate fixed header strip. -->
      <div class="draw-menu-body hide-scrollbar">
        <div class="control_card shadow-sm">
          <div class="preview-stage border border-primary/10">
            <div class="fill-chip" :style="{ backgroundColor: previewColor }" />
            <span class="preview-tag">Fill</span>
          </div>

          <div class="control_row">
            <label class="control_label">Opacity</label>
            <ion-range aria-label="Fill opacity" v-model="opacity"
                       :min="0" :max="100" color="secondary" />
            <span class="value_pill">{{ opacity }}%</span>
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
import { usePen } from '@/draw/tools/pen.store'
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

/* Shell, control rows, range, preview tag and scrollbar tokens are shared
   across the tool menus — see src/theme/draw-menu.css. */

.preview-stage {
  @apply relative rounded-xl overflow-hidden shadow-inner mb-1.5;
}

.fill-chip {
  @apply w-full h-11;
  background-image:
    linear-gradient(45deg, rgba(0,0,0,0.06) 25%, transparent 25%),
    linear-gradient(-45deg, rgba(0,0,0,0.06) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.06) 75%),
    linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.06) 75%);
  background-size: 14px 14px;
  background-position: 0 0, 0 7px, 7px -7px, -7px 0;
}

</style>
