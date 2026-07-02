<!-- components/lobby/PremiumLobbyModal.vue -->
<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-premium-modal"
  >
    <div class="h-full flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden">

      <!-- Header -->
      <div class="shrink-0 pt-2 mb-4 text-center relative">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          Lobby Full!
        </h1>
        <p class="text-xs opacity-70 uppercase tracking-widest mt-2">
          Regular slots are taken
        </p>
      </div>

      <div class="flex-1 flex flex-col items-center justify-center px-2 py-4">

        <div class="w-24 h-24 bg-amber-400/20 rounded-full flex items-center justify-center mb-6 border-4 border-white shadow-sm text-amber-500">
          <ion-icon :icon="svg(mdiStar)" class="text-5xl" />
        </div>

        <p class="text-lg font-black text-black text-center leading-tight px-4 mb-2">
          This room is packed, but Pro members get reserved VIP slots.
        </p>

        <p class="text-xs text-black/60 text-center uppercase tracking-widest italic px-6">
          Upgrade to skip the line and sketch in full lobbies.
        </p>
      </div>

      <!-- Action Area -->
      <div class="pt-4 pb-2 shrink-0">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          class="h-16 font-black uppercase "
          @click="confirmUpgrade"
        >
          <ion-icon :icon="svg(mdiStar)" slot="start" />Unlock Premium Slots
        </ion-button>
        <ion-button
          fill="clear"
          color="dark"
          expand="block"
          class="font-black uppercase tracking-widest text-xs mt-2 opacity-70"
          @click="handleDismiss"
        >
          Cancel
        </ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonModal, IonButton, IonIcon } from "@ionic/vue";
import { mdiStar } from "@mdi/js";
import { svg } from "@/helper/general.helper";

defineProps<{ isOpen: boolean }>();
const emit = defineEmits(["close", "upgrade"]);

const confirmUpgrade = () => {
	emit("upgrade");
	emit("close");
};

const handleDismiss = () => {
	emit("close");
};
</script>

<style scoped>
ion-modal.liquid-premium-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto;
  --max-height: 90vh;
  --background: var(--ion-color-tertiary);
}

ion-modal.liquid-premium-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>