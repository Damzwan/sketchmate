<template>
  <div class="w-full flex flex-col gap-3">

    <div
      v-if="firebaseUser?.isAnonymous"
      class="w-full rounded-[1.5rem] border border-amber-500/30 bg-amber-500/5 p-4 relative overflow-hidden flex flex-col shadow-sm"
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


    <SettingCard :icon="isParentalCard ? mdiShieldAccountOutline : mdiCakeVariantOutline" @click="openAgeModal">
      <template #label>
        <span class="block font-bold text-black text-base leading-tight">
          {{ isParentalCard ? 'Parental Controls' : 'Date of birth' }}
        </span>
        <template v-if="user?.date_of_birth">
          <span class="block text-base text-black/80 mt-0.5" :class="{ truncate: !isParentalCard }">
            {{ formattedDob }}
          </span>
        </template>
        <span v-if="isParentalCard" class="block text-[12px] font-bold text-amber-700 mt-0.5 leading-tight">
          {{ parentalSummary }}
        </span>
        <span v-else-if="!user?.date_of_birth" class="block text-[12px] text-amber-600 font-bold mt-0.5">
          Not set — tap to add
        </span>
      </template>
      <template #trailing>
        <ion-icon :icon="svg(isParentalCard ? mdiLockOutline : mdiPencilOutline)" class="text-lg text-black/30" />
      </template>
    </SettingCard>

    <SettingCard :icon="mdiPalette" @click="goToCustomization()">
      <template #label>
        <span class="block font-bold text-black text-base leading-tight">Customization</span>
      </template>
      <template #trailing>
        <ion-icon :icon="svg(mdiPencilOutline)" class="text-lg text-black/30" />
      </template>
    </SettingCard>

  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, useIonRouter } from "@ionic/vue";
import {
	mdiCakeVariantOutline,
	mdiLockOutline,
	mdiPalette,
	mdiPencilOutline,
	mdiShieldAccountOutline,
} from "@mdi/js";
import dayjs from "dayjs";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import SettingCard from "@/components/settings/SettingCard.vue";
import UpgradeAccountModal from "@/components/settings/UpgradeAccountModal.vue";
import { masterAnimation } from "@/helper/animation.helper";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { useDateOfBirthModalStore } from "@/store/dateOfBirth.store";
import {
	type ChildFeature,
	FEATURE_COPY,
	useParentalStore,
} from "@/store/parental.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

const r = useIonRouter();

const { user, firebaseUser, isUnderAge } = storeToRefs(useAuthStore());
const dobModal = useDateOfBirthModalStore();
const parental = useParentalStore();

const formattedDob = computed(() =>
	user.value?.date_of_birth
		? dayjs(user.value.date_of_birth).format("MMM D, YYYY")
		: "",
);

// Names what a parent has actually switched on, so the card reflects the real
// state of the account instead of a generic "safety is on".
const ALL_FEATURES: ChildFeature[] = [
	"mate_add",
	"mate_chat",
	"mate_send",
	"rooms",
];

// An account with no birthday on file is restricted too, but its card still has
// to read as "set your birthday", not as parental controls.
const isParentalCard = computed(
	() => isUnderAge.value && !!user.value?.date_of_birth,
);

const parentalSummary = computed(() => {
	const on = ALL_FEATURES.filter((f) => parental.isAllowed(f));
	if (!on.length)
		return "All social features are off — tap to review and manage them";
	return `On: ${on.map((f) => FEATURE_COPY[f].title.toLowerCase()).join(", ")}`;
});

async function openAgeModal() {
	// Under-age accounts land on the parental controls (adult gate lives inside
	// openControls), where the birthday is one row among the social switches. A
	// child editing their own birth date would otherwise lift every restriction.
	// No birthday on file yet: that's the neutral age screen, not a restriction
	// to bypass, so it opens without the gate.
	if (!user.value?.date_of_birth) {
		void dobModal.open("initial");
		return;
	}
	if (isUnderAge.value) {
		await parental.openControls();
		return;
	}
	void dobModal.open("edit");
}

function goToCustomization() {
	r.push(FRONTEND_ROUTES.customization, masterAnimation);
}
</script>