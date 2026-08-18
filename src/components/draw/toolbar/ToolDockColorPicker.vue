<template>
  <div
    class="flex items-center p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] shadow-lg space-x-1"
  >
    <ToolButton
      :icon="svg(mdiClose)"
      @click="cancelColorPicking"
      custom-class="hover:bg-primary/20"
    />

    <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

    <div class="px-3 flex items-center justify-center gap-2">
      <!-- The live reading, so the dock doubles as the readout while a finger
           is down and the loupe is up by the pointer. -->
      <span
        v-if="probe"
        class="w-5 h-5 rounded-md ring-1 ring-black/20 shrink-0"
        :style="{ backgroundColor: probe.hex.slice(0, 7) }"
      />
      <span
        class="text-sm font-bold text-black/80 whitespace-nowrap tracking-tight"
        :class="{ 'animate-pulse': !probe }"
      >
        {{ probe ? probe.hex.slice(0, 7) : 'Tap canvas to pick color...' }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { mdiClose } from "@mdi/js";
import { storeToRefs } from "pinia";
import { cancelColorPicking } from "@/components/draw/useCanvasEyedropper";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { svg } from "@/helper/general.helper";
import ToolButton from "./ToolButton.vue";

const { colorPickerProbe: probe } = storeToRefs(useDrawUIStore());
</script>

<style scoped>
.animate-pulse {
  animation: pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
