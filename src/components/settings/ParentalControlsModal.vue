<template>
  <BaseSheetModal
    :is-open="controlsOpen"
    title="Parental Controls"
    subtitle="For parents & guardians"
    scrollable
    @close="closeControls"
  >
    <div class="space-y-4 pt-1">

      <!-- WHAT THIS SCREEN IS -->
      <section class="bg-amber-50 border border-amber-200 rounded-[1.5rem] p-4 flex gap-3">
        <ion-icon :icon="svg(mdiShieldAccountOutline)" class="text-2xl text-amber-600 shrink-0" />
        <div class="text-amber-900 leading-snug">
          <p class="font-black text-[15px] leading-tight">This account is set up for a child under 13</p>
          <p class="text-[13px] mt-1 opacity-90">
            Everything that lets your child exchange messages, pictures or personal details with
            other people is off until you turn it on here. Public posts, public drawing rooms,
            balloons from strangers and name search stay off permanently while the account is under 13.
          </p>
        </div>
      </section>

      <!-- PER-FEATURE SWITCHES -->
      <section class="space-y-2">
        <p class="text-xs font-black text-black/70 uppercase tracking-widest px-1">
          Social features
        </p>

        <div
          v-for="feature in FEATURES"
          :key="feature"
          class="w-full bg-tertiary border border-primary/40 rounded-[1.5rem] p-4 shadow-sm flex items-start gap-3"
        >
          <span
            class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            :class="isAllowed(feature) ? 'bg-emerald-100' : 'bg-secondary/10'"
          >
            <ion-icon
              :icon="svg(FEATURE_ICON[feature])"
              class="text-xl"
              :class="isAllowed(feature) ? 'text-emerald-600' : 'text-secondary'"
            />
          </span>

          <div class="min-w-0 flex-1">
            <p class="font-bold text-black text-base leading-tight">
              {{ FEATURE_COPY[feature].title }}
            </p>
            <p class="text-[13px] text-black/70 leading-snug mt-0.5">
              {{ FEATURE_COPY[feature].body }}
            </p>
          </div>

          <ion-spinner
            v-if="savingFeature === feature"
            name="crescent"
            class="w-5 h-5 text-gray-500 shrink-0 mt-1"
          />
          <ion-toggle
            v-else
            mode="ios"
            color="secondary"
            class="shrink-0"
            :checked="isAllowed(feature)"
            :disabled="!!savingFeature"
            @ionChange="onToggle(feature, $event)"
          />
        </div>
      </section>

      <!-- ALWAYS-OFF LIST -->
      <section class="bg-white/60 border border-primary/40 rounded-[1.5rem] p-4">
        <p class="text-xs font-black text-black/70 uppercase tracking-widest mb-2">
          Always off under 13
        </p>
        <ul class="space-y-1.5">
          <li v-for="item in ALWAYS_OFF" :key="item" class="flex gap-2 items-start">
            <ion-icon :icon="svg(mdiLockOutline)" class="text-base text-black/40 shrink-0 mt-0.5" />
            <span class="text-[13px] text-black/80 leading-snug">{{ item }}</span>
          </li>
        </ul>
      </section>

      <!-- BIRTHDAY CORRECTION -->
      <button
        type="button"
        class="w-full bg-tertiary border border-primary/40 rounded-[1.5rem] p-4 shadow-sm flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
        @click="openBirthday"
      >
        <span class="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
          <ion-icon :icon="svg(mdiCakeVariantOutline)" class="text-xl text-secondary" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="block font-bold text-black text-base leading-tight">Birthday</span>
          <span class="block text-[13px] text-black/70 leading-snug mt-0.5">
            {{ formattedDob || 'Not set' }} — correct it if it's wrong.
          </span>
        </span>
        <ion-icon :icon="svg(mdiPencilOutline)" class="text-lg text-black/30 shrink-0" />
      </button>

      <p class="text-[12px] text-black/60 leading-snug px-2 pb-1">
        Your child is shown an online-safety reminder before they exchange anything, and again
        every 30 days. You can switch any of these back off at any time.
      </p>
    </div>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
	IonIcon,
	IonSpinner,
	IonToggle,
	type ToggleCustomEvent,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import dayjs from "dayjs";
import {
	mdiAccountMultiplePlusOutline,
	mdiCakeVariantOutline,
	mdiChatOutline,
	mdiDrawPen,
	mdiLockOutline,
	mdiPencilOutline,
	mdiSendOutline,
	mdiShieldAccountOutline,
} from "@mdi/js";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { useDateOfBirthModalStore } from "@/store/dateOfBirth.store";
import {
	type ChildFeature,
	FEATURE_COPY,
	useParentalStore,
} from "@/store/parental.store";

const parental = useParentalStore();
const { controlsOpen, savingFeature } = storeToRefs(parental);
const { isAllowed, closeControls, setFeature } = parental;

const { user } = storeToRefs(useAuthStore());
const dobModal = useDateOfBirthModalStore();

const FEATURES: ChildFeature[] = [
	"mate_add",
	"mate_chat",
	"mate_send",
	"rooms",
];

const FEATURE_ICON: Record<ChildFeature, string> = {
	mate_add: mdiAccountMultiplePlusOutline,
	mate_chat: mdiChatOutline,
	mate_send: mdiSendOutline,
	rooms: mdiDrawPen,
};

const ALWAYS_OFF = [
	"Being found by name search",
	"Public drawing lobbies with strangers",
	"Public community posts and comments",
	"Balloons sent by or to strangers",
];

const formattedDob = computed(() =>
	user.value?.date_of_birth
		? dayjs(user.value.date_of_birth).format("MMM D, YYYY")
		: "",
);

// Re-assert the stored value once the write settles: a failed save rolls the
// flag back in the store, and the switch has to follow it.
function onToggle(feature: ChildFeature, event: ToggleCustomEvent) {
	const target = event.target as HTMLIonToggleElement;
	void setFeature(feature, event.detail.checked).then(() => {
		target.checked = isAllowed(feature);
	});
}

// The adult is already past the gate here, so the picker opens directly.
function openBirthday() {
	closeControls();
	void dobModal.open("parental");
}
</script>
