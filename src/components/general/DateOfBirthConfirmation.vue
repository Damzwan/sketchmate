<template>
  <ion-modal
    :is-open="isOpen"
    :backdrop-dismiss="mode === 'edit'"
    @didDismiss="handleDismiss"
    @willPresent="handlePresent"
    class="liquid-dob-modal"
  >
    <div class="flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden h-full">

      <!-- HEADER -->
      <div class="shrink-0 pt-2 mb-4 text-center relative">
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
          {{ mode === 'edit' ? 'Update Birthday' : 'One Quick Thing' }}
        </h1>

      </div>

      <!-- BODY -->
      <div class="flex-1 overflow-y-auto px-1 space-y-5 hide-scrollbar pb-4 mt-2">

        <!-- SKETCHMATE CUSTOM DATE PICKER -->
        <div class="bg-white/70 border-2 border-white rounded-[2.5rem] shadow-inner p-6 flex flex-col items-center gap-4">
          <span class="text-[10px] font-black uppercase tracking-widest text-black/40">Select Birthdate</span>
          <SketchDatePicker v-model="computedDob" />
        </div>

        <!-- Community rules -->
        <div v-if="mode === 'initial'" class="bg-white/70 border-2 border-white rounded-[2.5rem] shadow-inner p-6">
          <p class="text-[10px] font-black uppercase tracking-widest text-black/40 mb-4 text-center">
            Community rules
          </p>
          <ul class="space-y-4">
            <li v-for="rule in WELCOME_RULES" :key="rule.title" class="flex gap-3 items-start">
              <span class="shrink-0 text-xl">{{ rule.emoji }}</span>
              <span class="text-black/70 text-[13px] leading-snug pt-0.5">
                <strong class="text-black font-black italic">{{ rule.title }}</strong> — {{ rule.body }}
              </span>
            </li>
          </ul>
        </div>

        <!-- Impact preview -->
        <div
          v-if="mode === 'edit' && willChangeAccess"
          class="rounded-[2.5rem] p-5 text-sm font-bold leading-snug flex items-center gap-4 border-2 transition-all duration-300 shadow-inner"
          :class="willUnlock
            ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
            : 'bg-amber-50 border-amber-100 text-amber-900'"
        >
          <div class="w-10 h-10 rounded-2xl bg-white shadow-sm flex items-center justify-center shrink-0 text-2xl">
            {{ willUnlock ? '✨' : '🌱' }}
          </div>
          <p class="flex-1">
            <span v-if="willUnlock">Saving unlocks public lobbies, posts, and balloons!</span>
            <span v-else>Saving hides public lobbies, posts, and balloons until you're 13.</span>
          </p>
        </div>
      </div>

      <!-- ACTION AREA / FOOTER -->
      <div class="pt-4 pb-2 shrink-0 flex flex-col gap-2">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          class="h-16 font-black uppercase m-0"
          :disabled="!isValidDob || isSubmitting || (mode === 'edit' && computedDob === initialDob)"
          @click="handleConfirm"
        >
          <ion-spinner v-if="isSubmitting" name="dots" />
          <span v-else>{{ mode === 'edit' ? 'Save Changes' : 'Continue' }}</span>
        </ion-button>

        <ion-button
          v-if="mode === 'edit'"
          fill="clear"
          color="dark"
          expand="block"
          class="font-black uppercase tracking-widest text-xs opacity-60 mt-1"
          :disabled="isSubmitting"
          @click="handleCancel"
        >
          Cancel
        </ion-button>
      </div>

    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonModal, IonSpinner } from "@ionic/vue";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";
import { isOldEnough } from "@/helper/general.helper";
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

const WELCOME_RULES = [
	{
		emoji: "🎨",
		title: "Make art freely",
		body: "weird, personal, expressive.",
	},
	{
		emoji: "🤝",
		title: "Respect others",
		body: "no harassment or hate speech.",
	},
	{
		emoji: "🚫",
		title: "Keep it safe",
		body: "nothing sexual, violent, or harmful.",
	},
	{
		emoji: "🔒",
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
		} else if (mode.value === "edit" && willChangeAccess.value) {
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
ion-modal.liquid-dob-modal {
  --width: fit-content;
  --min-width: 300px;
  --max-width: 80%;
  --height: fit-content;
  --background: var(--ion-color-tertiary);
  --border-radius: 2.5rem 2.5rem 2.5rem 2.5rem;
  border-radius: 16px;
  padding: 0;
}

ion-modal.liquid-dob-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}

.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>