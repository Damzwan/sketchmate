<template>
  <div class="w-full flex flex-col gap-4">

    <!-- Guest Profile Upgrade Banner -->
    <div
      v-if="firebaseUser?.isAnonymous"
      class="w-full rounded-[2rem] border-2 border-amber-500/20 bg-amber-500/10 p-5 relative overflow-hidden flex flex-col shadow-sm"
    >
      <div class="relative z-10">
        <h3 class="cabin-sketch-regular text-2xl font-black text-amber-900 leading-none mb-1">
          Guest Profile
        </h3>
        <p class="text-[13px] font-bold text-amber-900/60 leading-tight mb-4 pr-4">
          Create an account to save your progress and unlock social features.
        </p>
        <ion-button
          shape="round"
          color="warning"
          id="openUpgradeAccountModal"
        >
          Connect Account
        </ion-button>
      </div>

      <!-- Decorative abstract blob -->
      <div class="absolute -right-8 -bottom-8 w-32 h-32 bg-amber-500/20 rounded-full blur-2xl pointer-events-none"></div>

      <!-- The Modal -->
      <UpgradeAccountModal />
    </div>

    <!-- Date of Birth Item -->
    <ion-item color="tertiary" lines="none" class="rounded-2xl shadow-sm" button @click="openAgeModal">
      <ion-icon :icon="svg(mdiCakeVariantOutline)" slot="start" class="text-2xl text-black/60" />

      <ion-label class="cabin-sketch-regular py-2">
        <p class="font-bold text-black text-base leading-tight">Date of birth</p>
        <p v-if="user?.date_of_birth" class="text-[12px] text-black/50 mt-0.5 italic">
          {{ formattedDob }}
          <span v-if="isUnderAge" class="text-amber-700 font-bold not-italic">· social features hidden</span>
        </p>
        <p v-else class="text-[12px] text-amber-700 italic mt-0.5">
          Not set — tap to add
        </p>
      </ion-label>

      <ion-icon
        :icon="svg(mdiPencilOutline)"
        slot="end"
        class="text-lg text-black/40"
      />
    </ion-item>

  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonItem, IonLabel, IonButton } from "@ionic/vue";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import dayjs from "dayjs";
import { mdiCakeVariantOutline, mdiPencilOutline } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { useDateOfBirthModalStore } from "@/store/dateOfBirth.store";

// Import your new modal
import UpgradeAccountModal from "@/components/settings/UpgradeAccountModal.vue";

// Ensure firebaseUser is extracted from the store
const { user, firebaseUser, isUnderAge } = storeToRefs(useAuthStore());
const dobModal = useDateOfBirthModalStore();

const formattedDob = computed(() =>
	user.value?.date_of_birth
		? dayjs(user.value.date_of_birth).format("MMM D, YYYY")
		: "",
);

function openAgeModal() {
	const mode = user.value?.date_of_birth ? "edit" : "initial";
	void dobModal.open(mode);
}
</script>