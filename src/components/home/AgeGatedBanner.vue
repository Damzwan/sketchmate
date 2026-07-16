<template>
  <!-- AGE-GATED BANNER (Safe Mode) -->
  <section
    v-if="showSafeModeBanner"
    class="bg-amber-50/90 backdrop-blur-sm border border-amber-300/60 rounded-[1.5rem] p-4 shadow-sm flex flex-col gap-3 mx-1"
  >
    <!-- Child-Friendly Message -->
    <div class="flex gap-3 items-start">
      <div class="w-10 h-10 rounded-full bg-amber-200/50 flex items-center justify-center shrink-0">
        <ion-icon :icon="svg(mdiSproutOutline)" class="text-2xl text-amber-700" />
      </div>
      <div class="flex-1 min-w-0 pt-0.5">
        <p class="font-black text-[15px] text-amber-900 leading-tight tracking-tight">
          Safe Mode is On 🌱
        </p>
        <p class="text-[13px] text-amber-900/90 mt-1 leading-snug font-medium">
          You can draw, save art, and play with mates you add in person! Searching for strangers and public lobbies are hidden to keep things safe.
        </p>
      </div>
    </div>

    <div class="h-px bg-amber-200/60 w-full my-0.5"></div>

    <!-- Parent / Guardian Controls -->
    <div class="flex items-center justify-between gap-2 pl-1">
      <div class="flex-1 pr-2">
        <p class="text-[10px] font-black text-amber-800/70 uppercase tracking-widest leading-tight">
          Parents & Guardians
        </p>
        <p class="text-[11px] text-amber-900/80 font-medium leading-tight mt-0.5">
          Manage social features or fix an incorrect birthday.
        </p>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          @click="dismissBanner"
          class="text-xs cursor-pointer font-bold text-amber-800/70 active:opacity-60 px-2 py-2"
        >
          Dismiss
        </button>
        <button
          @click="goToSettings"
          class="shrink-0 bg-amber-200/60 hover:bg-amber-300/60 text-amber-900 text-xs font-black py-2 px-3.5 rounded-xl transition-all active:scale-95 cursor-pointer border border-amber-300/50"
        >
          Settings
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonIcon, useIonRouter } from "@ionic/vue";
import { mdiSproutOutline } from "@mdi/js";
import { Preferences } from "@capacitor/preferences";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";

const { isUnderAge } = storeToRefs(useAuthStore());
const r = useIonRouter();

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

const goToSettings = () => {
	r.push(FRONTEND_ROUTES.settings, masterAnimation);
};
</script>