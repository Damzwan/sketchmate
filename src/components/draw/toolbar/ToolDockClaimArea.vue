<template>
  <div
    class="flex items-center p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] shadow-lg space-x-1"
  >
    <ToolButton
      :icon="svg(mdiClose)"
      @click="exitClaimMode"
      custom-class="hover:bg-primary/20"
    />

    <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

    <div class="px-3 flex items-center justify-center gap-2">
      <ion-icon :icon="svg(mdiSelectionDrag)" class="text-black/70 text-lg shrink-0" />
      <span class="text-sm font-bold text-black/80 whitespace-nowrap animate-pulse tracking-tight">
        Hold &amp; drag to place your area
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiClose, mdiSelectionDrag } from "@mdi/js";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { svg } from "@/helper/general.helper";
import ToolButton from "./ToolButton.vue";

const claim = useClaimArea();
const exitClaimMode = () => claim.exitClaimMode();
</script>

<style scoped>
.animate-pulse {
  animation: pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
</style>
