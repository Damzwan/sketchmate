<template>
  <!-- SAFE MODE BANNER
       One row, two readers. The child gets the headline ("ask a grown-up") and
       the one safety line that matters; the parent gets a button that lands
       straight on the controls. Everything longer lives in the controls sheet
       and in the blocking safety reminder, so this stays a signpost. -->
  <section
    v-if="showSafeModeBanner"
    class="relative bg-amber-100/90 backdrop-blur-sm border border-amber-300/70 rounded-[1.5rem] px-3.5 py-3 shadow-sm mx-1"
  >
    <button
      @click="dismissBanner"
      aria-label="Dismiss"
      class="absolute top-1.5 right-2 w-6 h-6 flex items-center justify-center text-amber-800/50 active:opacity-60 cursor-pointer"
    >
      <ion-icon :icon="svg(mdiClose)" class="text-sm" />
    </button>

    <div class="flex items-center gap-3">
      <div class="w-11 h-11 rounded-2xl bg-amber-200/70 flex items-center justify-center shrink-0">
        <ion-icon :icon="svg(allLocked ? mdiLockOutline : mdiSproutOutline)" class="text-2xl text-amber-700" />
      </div>

      <div class="flex-1 min-w-0 pr-5">
        <p class="font-black text-[15px] text-amber-900 leading-tight tracking-tight">
          {{ headline }}
        </p>
        <p class="text-[12.5px] text-amber-900/85 leading-snug font-medium mt-0.5">
          {{ subline }}
        </p>
      </div>
    </div>

    <ion-button
      expand="block"
      shape="round"
      color="secondary"
      class="mt-2.5"
      @click="openControls"
    >
      <ion-icon slot="start" :icon="svg(mdiShieldAccountOutline)" class="text-base mr-1" />
      Grown-ups: manage safety
    </ion-button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import {
	mdiClose,
	mdiLockOutline,
	mdiShieldAccountOutline,
	mdiSproutOutline,
} from "@mdi/js";
import { Preferences } from "@capacitor/preferences";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { type ChildFeature, useParentalStore } from "@/store/parental.store";

const { isUnderAge } = storeToRefs(useAuthStore());
const parental = useParentalStore();

const ALL_FEATURES: ChildFeature[] = [
	"mate_add",
	"mate_chat",
	"mate_send",
	"rooms",
];

const unlockedCount = computed(
	() => ALL_FEATURES.filter((f) => parental.isAllowed(f)).length,
);
const allLocked = computed(() => unlockedCount.value === 0);

// Headline speaks to the child (what to do), subline carries the one safety
// rule worth repeating on every visit plus the state a parent needs.
const headline = computed(() =>
	allLocked.value
		? "Ask a grown-up to unlock"
		: `Safe Mode · ${unlockedCount.value} of ${ALL_FEATURES.length} on`,
);

const subline = computed(() =>
	allLocked.value
		? "Chatting, mates and sharing are off. Drawing and saving still work."
		: "Only share with people you know in real life — never your name, address or school.",
);

const safeModeDismissed = ref(false);

// Using a raw string for the preference key, or you can add it to your LocalStorage enum
const STORAGE_KEY = "safe-mode-banner-dismissed";

const showSafeModeBanner = computed(
	() => isUnderAge.value && !safeModeDismissed.value,
);

// Check if it was dismissed previously
Preferences.get({ key: STORAGE_KEY }).then(({ value }) => {
	safeModeDismissed.value = value === "true";
});

function dismissBanner() {
	safeModeDismissed.value = true;
	Preferences.set({ key: STORAGE_KEY, value: "true" });
}

const openControls = () => {
	void parental.openControls();
};
</script>