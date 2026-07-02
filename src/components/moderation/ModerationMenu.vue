<template>
  <ion-modal
    :is-open="moderationMenuOpen"
    @did-dismiss="handleDismiss"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="moderation-bottom-modal"
  >
    <div v-if="notice" class="h-full flex flex-col p-6 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden justify-between">

      <!-- Header -->
      <div class="shrink-0 pt-4 mb-6 text-center">
        <ion-icon :icon="svg(mdiPauseOctagonOutline)" class="text-[54px] mb-2 leading-none" :class="modStore.level >= 3 ? 'text-red-500' : 'text-amber-500'" />
        <h1
          class="text-3xl font-black tracking-tighter italic leading-none"
          :class="modStore.level >= 3 ? 'text-red-500' : 'text-amber-500'"
        >
          Action Paused
        </h1>
      </div>

      <!-- Content Area (Simplified) -->
      <div class="flex-1 overflow-y-auto px-2 pb-4 flex flex-col justify-center hide-scrollbar">
        <div class="bg-white rounded-3xl p-6 text-center border border-black/5 shadow-sm">
          <p class="text-[15px] font-bold text-gray-700 leading-snug">
            You cannot perform this action right now because your account is currently on a pause.
          </p>

          <div v-if="notice.expires_at" class="mt-4 pt-4 border-t border-gray-100">
            <p class="text-[12px] font-bold text-gray-400 uppercase tracking-widest mb-1">Restriction Lifts</p>
            <p class="text-sm font-black text-amber-600 bg-amber-50 py-1.5 px-3 rounded-lg inline-block">
              {{ formatExpiry(notice.expires_at) }}
            </p>
          </div>
        </div>
      </div>

      <div class="pt-4 pb-2 shrink-0">
        <ion-button
          expand="block"
          :color="modStore.level >= 3 ? 'danger' : 'warning'"
          shape="round"
          @click="goToStanding"
        >
          Review Account Standing
        </ion-button>
        <ion-button
          fill="clear"
          color="dark"
          expand="block"
          class="mt-2"
          @click="handleDismiss"
        >
          Dismiss
        </ion-button>
      </div>

    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { IonModal, IonButton, IonIcon, useIonRouter } from "@ionic/vue";
import dayjs from "dayjs";
import { mdiPauseOctagonOutline } from "@mdi/js";

import { useMenuStore } from "@/store/menu.store";
import { useModerationStore } from "@/store/moderation.store";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";
import { svg } from "@/helper/general.helper";

const router = useIonRouter();
const modStore = useModerationStore();
const menuStore = useMenuStore();

const { pendingStrikeNotice: notice } = storeToRefs(modStore);
const { moderationMenuOpen } = storeToRefs(menuStore);

// --- ACTIONS ---

const handleDismiss = () => {
	moderationMenuOpen.value = false;
	// Small delay so the swipe-down animation finishes before clearing the store
	setTimeout(() => {
		modStore.dismissStrikeNotice();
	}, 300);
};

const goToStanding = () => {
	handleDismiss();
	router.push(FRONTEND_ROUTES.moderation, masterAnimation);
};

// --- HELPERS ---

function formatExpiry(iso: string): string {
	const d = dayjs(iso);
	if (d.isBefore(dayjs())) return "Lifting now…";
	return d.format("MMM D, h:mm A");
}
</script>

<style scoped>
@reference "@/theme/main.css";

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

ion-modal.moderation-bottom-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto;
  --max-height: 90vh;
  --background: var(--ion-color-tertiary, #f3f4f6);
}

ion-modal.moderation-bottom-modal::part(handle) {
  background: var(--ion-color-dark, #000);
  opacity: 0.15;
  width: 40px;
}
</style>