<!-- components/lobby/PremiumLobbyModal.vue -->
<template>
  <BaseSheetModal
    :is-open="isOpen"
    title="Lobby Full!"
    subtitle="Regular slots are taken"
    @close="handleDismiss"
  >
    <div class="flex-1 flex flex-col items-center justify-center px-2 py-4">

      <div class="w-24 h-24 bg-amber-400/20 rounded-full flex items-center justify-center mb-6 border-4 border-white shadow-sm text-amber-500">
        <ion-icon :icon="svg(mdiStar)" class="text-5xl" />
      </div>

      <p class="text-lg font-black text-black text-center leading-tight px-4 mb-2">
        This room is packed, but Pro members get reserved VIP slots.
      </p>

      <p class="text-sm text-black/80 text-center uppercase tracking-widest px-6">
        Upgrade to skip the line and sketch in full lobbies.
      </p>
    </div>

    <template #footer>
      <ion-button
        expand="block"
        color="secondary"
        shape="round"
        size="large"
        @click="confirmUpgrade"
      >
        <ion-icon :icon="svg(mdiStar)" slot="start" />
        Unlock Premium Slots
      </ion-button>

      <div class="flex justify-center pt-2">
        <ion-button
          fill="clear"
          color="secondary"
          size="large"
          @click="handleDismiss"
        >
          Cancel
        </ion-button>
      </div>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiStar } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";

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
