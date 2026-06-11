<template>
  <div class="w-full flex flex-col gap-3">

    <div
      v-if="firebaseUser?.isAnonymous"
      class="w-full rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 relative overflow-hidden flex flex-col shadow-sm"
    >
      <div class="relative z-10">
        <h3 class="cabin-sketch-regular text-xl font-black text-amber-900 leading-none mb-1">
          Guest Profile
        </h3>
        <p class="text-[13px] font-bold text-amber-800/80 leading-tight mb-3 pr-4">
          Create an account to save your progress and unlock social features.
        </p>
        <ion-button
          shape="round"
          color="warning"
          size="small"
          id="openUpgradeAccountModal"
          class="font-bold self-start inline-block"
        >
          Connect Account
        </ion-button>
      </div>

      <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none"></div>

      <UpgradeAccountModal />
    </div>

    <button
      @click="openAgeModal"
      class="w-full flex items-center justify-between text-left bg-white/40 border border-primary/10 rounded-2xl p-3 shadow-sm active:bg-white/70 transition-all cursor-pointer"
    >
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <ion-icon :icon="svg(mdiCakeVariantOutline)" class="text-xl text-black/70" />
        </div>
        <div class="cabin-sketch-regular min-w-0">
          <p class="font-bold text-black text-base leading-tight">Date of birth</p>
          <p v-if="user?.date_of_birth" class="text-[12px] text-black/50 mt-0.5 font-black truncate">
            {{ formattedDob }}
            <span v-if="isUnderAge" class="text-amber-700 ml-1">· social features hidden</span>
          </p>
          <p v-else class="text-[12px] text-amber-600 font-bold mt-0.5">
            Not set — tap to add
          </p>
        </div>
      </div>

      <ion-icon
        :icon="svg(mdiPencilOutline)"
        class="text-lg text-black/30 pr-1"
      />
    </button>

  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonButton } from "@ionic/vue";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import dayjs from "dayjs";
import { mdiCakeVariantOutline, mdiPencilOutline } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { useDateOfBirthModalStore } from "@/store/dateOfBirth.store";
import UpgradeAccountModal from "@/components/settings/UpgradeAccountModal.vue";

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