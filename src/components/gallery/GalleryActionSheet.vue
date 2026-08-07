<template>
  <transition name="dock-pop">
    <div
      v-if="selectedMode"
      class="fixed bottom-28 left-1/2 -translate-x-1/2 z-[1000] flex items-center p-1.5 rounded-[22px] border border-primary/80 bg-primary/60 backdrop-blur-lg shadow-xl transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
    >
      <!-- Selection Info Section -->
      <div class="px-5 py-2.5 flex flex-col items-center justify-center border-r border-primary-shade/40">
        <span class="text-2xl font-black text-black leading-none tabular-nums">{{ count }}</span>
        <span class="text-[10px] font-black text-black/50 uppercase tracking-[0.18em] mt-1">Items</span>
      </div>

      <!-- Action Row -->
      <div class="flex items-center space-x-1.5 px-2">
        <!-- Share Action -->
        <ion-button
          fill="clear"
          @click="emits('share')"
          class="gallery-action-btn"
        >
          <div class="flex flex-col items-center py-1">
            <ion-icon :icon="svg(mdiShareVariantOutline)" class="text-2xl text-black" />
            <span class="text-[10px] font-black uppercase tracking-wider mt-1 text-black/80">Share</span>
          </div>
        </ion-button>

        <!-- Delete Action -->
        <ion-button
          fill="clear"
          @click="emits('delete')"
          class="gallery-action-btn"
        >
          <div class="flex flex-col items-center py-1">
            <ion-icon :icon="svg(mdiDeleteOutline)" class="text-2xl text-black" />
            <span class="text-[10px] font-black uppercase tracking-wider mt-1 text-black/80">Delete</span>
          </div>
        </ion-button>

        <div class="w-[2.5px] h-8 bg-primary-shade mx-2 rounded-full opacity-50"></div>

        <!-- Close Action -->
        <ion-button
          fill="clear"
          @click="emits('cancel')"
          class="gallery-close-btn"
        >
          <ion-icon slot="icon-only" :icon="svg(mdiClose)" class="text-xl text-black/70" />
        </ion-button>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiClose, mdiDeleteOutline, mdiShareVariantOutline } from "@mdi/js";
import { svg } from "@/helper/general.helper";

defineProps<{
	selectedMode: boolean;
	count: number;
}>();

const emits = defineEmits(["cancel", "delete", "share"]);
</script>

<style scoped>
.gallery-action-btn {
  --padding-start: 12px;
  --padding-end: 12px;
  --border-radius: 16px;
  --color: black;
  --background-activated: rgba(var(--ion-color-primary-rgb), 0.3);
  margin: 0;
  height: 56px;
  min-width: 68px;
}

.gallery-close-btn {
  --padding-start: 0;
  --padding-end: 0;
  --border-radius: 50%;
  --background-activated: rgba(0, 0, 0, 0.1);
  margin: 0;
  width: 44px;
  height: 44px;
}

/* Entrance Animation matching your tool selection logic */
.dock-pop-enter-active {
  transition: all 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}
.dock-pop-leave-active {
  transition: all 0.4s cubic-bezier(0.32, 0.72, 0, 1);
}

.dock-pop-enter-from,
.dock-pop-leave-to {
  opacity: 0;
  transform: translate(-50%, 60px) scale(0.8);
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
}

ion-icon {
  flex-shrink: 0;
}
</style>