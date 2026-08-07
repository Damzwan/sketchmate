<template>
  <!-- Name is no longer painted under the swatch, so the label has to survive as
       the accessible name (and as a desktop tooltip) — otherwise these become
       nine unnamed buttons to a screen reader. -->
  <button
    type="button"
    class="brush_tile"
    :aria-label="label"
    :aria-pressed="selected"
    :title="label"
    @click="$emit('tap', type)"
  >
    <div
      class="brush_swatch"
      :class="{
        'brush_swatch--selected': selected,
        'brush_swatch--previewed': previewed
      }"
    >
      <ion-icon
        class="brush_icon"
        :class="accent"
        :icon="svg(iconPath)"
      />

      <div v-if="!owned" class="brush_lock">
        <ion-icon :icon="svg(mdiLock)" />
      </div>
    </div>

  </button>
</template>

<script lang="ts" setup>
import { IonIcon } from "@ionic/vue";
import { mdiLock } from "@mdi/js";
import { BrushType } from "@/draw/tools/tool.types";
import { svg } from "@/helper/general.helper";

defineProps<{
	type: BrushType;
	accent: string;
	selected: boolean;
	owned: boolean;
	previewed: boolean;
	label: string;
	iconPath: string;
}>();

defineEmits<(e: "tap", type: BrushType) => void>();
</script>

<style scoped>
@reference "@/theme/main.css";

.brush_tile {
  @apply flex items-center justify-center bg-transparent border-0
  active:scale-95 transition-transform cursor-pointer w-full min-w-0;
}

/* Stays 44px — this is the touch target; only the surrounding air shrank. */
.brush_swatch {
  @apply relative w-11 h-11 rounded-xl flex items-center justify-center
  bg-black/5 ring-1 ring-black/5 transition-all duration-200;
}

.brush_icon {
  @apply w-5 h-5;
}

.brush_swatch--selected {
  @apply ring-2 ring-secondary bg-secondary/10 shadow-md scale-105;
}

.brush_swatch--previewed {
  @apply ring-2 ring-purple-500;
}

.brush_lock {
  @apply absolute -top-1 -right-1 w-4 h-4 bg-black rounded-full
  flex items-center justify-center shadow-md;
}

.brush_lock ion-icon {
  @apply text-white w-2.5 h-2.5;
}
</style>
