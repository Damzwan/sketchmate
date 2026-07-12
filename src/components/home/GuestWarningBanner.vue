<template>
  <template v-if="showGuestWarning">
    <!-- GUEST WARNING — art is only local until they connect an account -->
    <section
      class="bg-amber-50/60 backdrop-blur-sm border border-amber-200/80 rounded-3xl p-4 flex gap-3 shadow-sm cabin-sketch-regular"
    >
      <ion-icon :icon="svg(mdiContentSaveAlertOutline)" class="text-2xl shrink-0 text-amber-700" />
      <div class="flex-1 min-w-0">
        <p class="font-black text-base text-amber-900 leading-tight">
          You're drawing as a guest
        </p>
        <p class="text-sm text-amber-900/90 mt-1 leading-snug">
          Your art lives only on this device. Connect an account so you never lose it if you log out or switch phones.
        </p>
        <div class="flex items-center gap-4 mt-3">
          <button
            :id="guestUpgradeTriggerId"
            class="text-sm cursor-pointer font-black text-amber-900 underline active:opacity-60"
          >
            Connect account
          </button>
          <button
            @click="dismissGuestWarning"
            class="text-sm cursor-pointer font-bold text-amber-800/80 active:opacity-60"
          >
            Don't remind me
          </button>
        </div>
      </div>
    </section>
    <UpgradeAccountModal :trigger="guestUpgradeTriggerId" />
  </template>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonIcon } from "@ionic/vue";
import { mdiContentSaveAlertOutline } from "@mdi/js";
import { Preferences } from "@capacitor/preferences";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { LocalStorage } from "@/types/storage.types";
import UpgradeAccountModal from "@/components/settings/UpgradeAccountModal.vue";

// Guest = anonymous firebase account; art is device-only until they link one.
const guestUpgradeTriggerId = "home-guest-upgrade-trigger";
const { firebaseUser } = storeToRefs(useAuthStore());
const guestWarningDismissed = ref(false);

const showGuestWarning = computed(
	() => !!firebaseUser.value?.isAnonymous && !guestWarningDismissed.value,
);

Preferences.get({ key: LocalStorage.guestUpgradeDismissed }).then(
	({ value }) => {
		guestWarningDismissed.value = value === "true";
	},
);

function dismissGuestWarning() {
	guestWarningDismissed.value = true;
	Preferences.set({ key: LocalStorage.guestUpgradeDismissed, value: "true" });
}
</script>
