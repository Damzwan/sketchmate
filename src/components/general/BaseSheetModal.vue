<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="$emit('close')"
    @did-present="$emit('present')"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-base-modal"
    :class="{ 'is-scrollable': scrollable }"
  >
    <div class="h-full flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden relative">

      <div class="absolute top-2 left-2 z-20" v-if="showBack">
        <transition name="fade">
          <ion-button @click="$emit('back')" fill="clear" color="dark" class="m-0">
            <ion-icon :icon="svg(mdiChevronLeft)" slot="icon-only" class="text-2xl" />
          </ion-button>
        </transition>
      </div>

      <div class="absolute top-2 right-2 z-20">
        <ion-button @click="$emit('close')" fill="clear" color="dark" class="m-0">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
        </ion-button>
      </div>

      <div class="shrink-0 pt-0 mb-2 text-center mt-2">
        <slot name="header">
          <h1 v-if="title" class="text-4xl cabin-sketch-regular text-secondary font-black tracking-tighter italic leading-none">
            {{ title }}
          </h1>
          <p v-if="subtitle" class="font-bold uppercase tracking-widest mt-1.5 cabin-sketch-regular">
            {{ subtitle }}
          </p>
        </slot>
      </div>

      <div v-if="$slots['sub-header']" class="shrink-0 mb-2">
        <slot name="sub-header"></slot>
      </div>

      <div
        class="flex-1 overflow-y-auto px-1 hide-scrollbar pb-4 mt-1"
        data-content-scroll="true"
        @touchmove.stop
      >
        <slot></slot>
      </div>

      <div v-if="$slots.footer" class="pt-4 pb-2 shrink-0">
        <slot name="footer"></slot>
      </div>

    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { provide } from "vue";
import { IonModal, IonButton, IonIcon } from "@ionic/vue";
import { mdiClose, mdiChevronLeft } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { AMBIENT_FOREGROUND } from "@/store/ambientPause.store";

// Sheet content IS the overlay the user is looking at — worlds/effects inside
// it (theme/effect/world pickers, shop previews) must keep animating while the
// global ambient pause freezes everything behind the sheet. Closed-but-mounted
// sheets are harmless: their content has no box, so the IntersectionObserver
// gate keeps those instances paused anyway.
provide(AMBIENT_FOREGROUND, true);

withDefaults(
	defineProps<{
		isOpen: boolean;
		title?: string;
		subtitle?: string;
		showBack?: boolean;
		scrollable?: boolean; // New configuration prop
	}>(),
	{
		showBack: false,
		scrollable: false, // Small content sheets stay auto-height by default
	},
);

defineEmits(["close", "back", "present"]);
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

ion-modal.liquid-base-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto; /* Default layout behaviors match tiny/modal size limits */
  --max-height: 90vh;
  --background: var(--ion-color-tertiary);
}

/* When explicitly heavy/scrollable content needs to fit safely up to max-height */
ion-modal.liquid-base-modal.is-scrollable {
  --height: 100%;
}

ion-modal.liquid-base-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
.overflow-y-auto {
  mask-image: linear-gradient(to bottom, black 95%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 95%, transparent 100%);
}
.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>