<template>
  <ion-modal
    :is-open="isOpen"
    :backdrop-dismiss="mode !== 'initial'"
    @didDismiss="handleDismiss"
    @willPresent="handlePresent"
    class="sketch-modal"
  >
    <div class="flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden h-full">

      <!-- HEADER -->
      <div class="shrink-0 pt-1 mb-4 flex items-center justify-between gap-3">
        <h1 class="text-2xl text-black font-bold tracking-tight leading-none">
          {{ mode === 'parental' ? 'Parental Controls' : mode === 'edit' ? 'Update birthday' : 'One quick thing' }}
        </h1>

        <button
          v-if="mode !== 'initial'"
          type="button"
          @click="handleCancel"
          :disabled="isSubmitting"
          class="w-9 h-9 -mr-1 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform"
          aria-label="Close"
        >
          <ion-icon :icon="svg(mdiClose)" class="text-2xl text-black/50" />
        </button>
      </div>

      <!-- BODY -->
      <div class="flex-1 overflow-y-auto px-1 space-y-4 hide-scrollbar pb-2">

        <!-- SKETCHMATE CUSTOM DATE PICKER -->
        <div class="bg-tertiary border border-primary/40 rounded-[1.5rem] shadow-sm p-6 flex flex-col items-center gap-4">
          <span class="text-sm font-bold uppercase tracking-widest text-black/80">Select birthdate</span>
          <SketchDatePicker v-model="computedDob" />
        </div>

        <!-- Community rules -->
        <div v-if="mode === 'initial'" class="bg-tertiary border border-primary/40 rounded-[1.5rem] shadow-sm p-5">
          <p class="text-xm font-bold uppercase tracking-widest text-black/50 mb-3">
            Community rules
          </p>
          <ul class="space-y-3">
            <li v-for="rule in WELCOME_RULES" :key="rule.title" class="flex gap-3 items-start">
              <div class="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
                <ion-icon :icon="svg(rule.icon)" class="text-lg text-secondary" />
              </div>
              <span class="text-black/80 text-base leading-snug pt-1">
                <strong class="text-black font-bold">{{ rule.title }}</strong> — {{ rule.body }}
              </span>
            </li>
          </ul>
        </div>

        <!-- For parents: what the current birthday blocks, and what saving an
             older one switches on. The list flips live with the picked date so
             the consequence of saving is never a surprise. -->
        <div v-if="mode === 'parental'" class="bg-tertiary border border-primary/40 rounded-[1.5rem] shadow-sm p-5">
          <p class="text-lg font-bold uppercase tracking-widest text-black/80 mb-1">
            For parents &amp; guardians
          </p>
          <p class="text-base text-black/80 leading-snug mb-3">
            <span v-if="willUnlock">
              The selected birthday is 13 or older — saving turns
              <strong class="text-black font-bold">ON</strong> these social features:
            </span>
            <span v-else>
              While this account is under 13, these social features stay
              <strong class="text-black font-bold">OFF</strong>:
            </span>
          </p>
          <ul class="space-y-3">
            <li v-for="f in PARENTAL_FEATURES" :key="f.title" class="flex gap-3 items-start">
              <div
                class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                :class="willUnlock ? 'bg-emerald-100' : 'bg-secondary/10'"
              >
                <ion-icon
                  :icon="svg(f.icon)"
                  class="text-lg"
                  :class="willUnlock ? 'text-emerald-600' : 'text-secondary'"
                />
              </div>
              <span class="text-black/80 text-base leading-snug pt-1">
                <strong class="text-black font-bold">{{ f.title }}</strong> — {{ f.body }}
                <span v-if="f.optional" class="block text-sm text-black/80">
                  Can be turned off anytime in Settings.
                </span>
              </span>
            </li>
          </ul>
        </div>

        <!-- Impact preview -->
        <div
          v-if="mode === 'edit' && willChangeAccess"
          class="rounded-[1.5rem] p-4 text-sm font-medium leading-snug flex items-center gap-3 border"
          :class="willUnlock
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'"
        >
          <div class="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0">
            <ion-icon :icon="svg(willUnlock ? mdiCreation : mdiSproutOutline)" class="text-2xl" :class="willUnlock ? 'text-emerald-600' : 'text-amber-600'" />
          </div>
          <p class="flex-1">
            <span v-if="willUnlock">Saving unlocks public lobbies, posts, and balloons!</span>
            <span v-else>Saving hides public lobbies, posts, and balloons until you're 13.</span>
          </p>
        </div>
      </div>

      <!-- ACTION AREA / FOOTER -->
      <div class="pt-4 mb-4 shrink-0">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          :disabled="!isValidDob || isSubmitting || (mode !== 'initial' && computedDob === initialDob)"
          @click="handleConfirm"
        >
          <ion-spinner v-if="isSubmitting" name="dots" />
          <span v-else>{{ mode !== 'initial' ? 'Save changes' : 'Continue' }}</span>
        </ion-button>
      </div>

    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal, IonSpinner } from "@ionic/vue";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import {
	mdiAccountGroupOutline,
	mdiBalloon,
	mdiChatOutline,
	mdiClose,
	mdiCreation,
	mdiHandshakeOutline,
	mdiImageMultipleOutline,
	mdiLockOutline,
	mdiPalette,
	mdiShieldAlertOutline,
	mdiSproutOutline,
} from "@mdi/js";
import { useAuthStore } from "@/store/auth.store";
import { isOldEnough, svg } from "@/helper/general.helper";
import { updateUser } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import { ToastDuration } from "@/types/toast.types";
import { useDateOfBirthModalStore } from "@/store/dateOfBirth.store";
import SketchDatePicker from "@/components/general/SketchDatePicker.vue"; // Adjust path as needed

const modalStore = useDateOfBirthModalStore();
const { isOpen, mode } = storeToRefs(modalStore);
const { user } = storeToRefs(useAuthStore());
const { toast } = useToast();

const computedDob = ref<string | undefined>();
const initialDob = ref<string | undefined>();
const isSubmitting = ref(false);

const isValidDob = computed(() => !!computedDob.value);

const willChangeAccess = computed(() => {
	if (!isValidDob.value || !initialDob.value) return false;
	return isOldEnough(initialDob.value) !== isOldEnough(computedDob.value!);
});

const willUnlock = computed(() =>
	isValidDob.value ? isOldEnough(computedDob.value!) : false,
);

// The social features gated by age, in parent-readable terms. `optional`
// marks the ones that stay individually switchable in Settings after unlock.
const PARENTAL_FEATURES = [
	{
		icon: mdiImageMultipleOutline,
		title: "Public posts",
		body: "sharing drawings to the public feed.",
		optional: true,
	},
	{
		icon: mdiBalloon,
		title: "Balloons",
		body: "surprise drawings sent by strangers.",
		optional: true,
	},
	{
		icon: mdiAccountGroupOutline,
		title: "Public lobbies",
		body: "live drawing rooms with unknown artists.",
		optional: false,
	},
	{
		icon: mdiChatOutline,
		title: "Chatting with strangers",
		body: "messages beyond mates added in person (QR / link).",
		optional: false,
	},
];

const WELCOME_RULES = [
	{
		icon: mdiPalette,
		title: "Make art freely",
		body: "weird, personal, expressive.",
	},
	{
		icon: mdiHandshakeOutline,
		title: "Respect others",
		body: "no harassment or hate speech.",
	},
	{
		icon: mdiShieldAlertOutline,
		title: "Keep it safe",
		body: "nothing sexual, violent, or harmful.",
	},
	{
		icon: mdiLockOutline,
		title: "Stay private",
		body: "don't share real info with strangers.",
	},
];

function handlePresent() {
	isSubmitting.value = false;
	computedDob.value = user.value?.date_of_birth || undefined;
	initialDob.value = user.value?.date_of_birth || undefined;
}

function handleDismiss() {
	isOpen.value = false;
	modalStore.resolve(null);
}

function handleCancel() {
	modalStore.close();
	modalStore.resolve(null);
}

async function handleConfirm() {
	if (
		!isValidDob.value ||
		isSubmitting.value ||
		!user.value ||
		!computedDob.value
	)
		return;
	isSubmitting.value = true;

	try {
		await updateUser({
			_id: user.value._id,
			date_of_birth: computedDob.value,
		});
		user.value.date_of_birth = computedDob.value;

		if (!isOldEnough(computedDob.value)) {
			toast(
				"Social features hidden until you're 13 — keep drawing and saving!",
				{ color: "warning", duration: ToastDuration.long },
			);
		} else if (mode.value !== "initial" && willChangeAccess.value) {
			toast("Social features unlocked.", { color: "success" });
		}

		modalStore.close();
		modalStore.resolve(computedDob.value);
	} catch (e) {
		toast("Couldn't save, please try again", { color: "danger" });
	} finally {
		isSubmitting.value = false;
	}
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>