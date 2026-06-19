<template>
  <ion-content class="bg-primary my-safe-area cabin-sketch-regular">
    <div class="w-full min-h-full flex flex-col">

      <!-- HEADER -->
      <div class="px-8 pt-10 pb-6 text-center shrink-0">
        <h1 class="text-5xl text-black font-black italic tracking-tighter leading-none">
          Safety & Community
        </h1>
        <p class="text-[11px] font-black opacity-40 uppercase tracking-[0.2em] mt-3">
          Help us keep Sketchmate safe
        </p>
      </div>

      <!-- SCROLLABLE BODY -->
      <div class="flex-1 px-5 pb-8 flex flex-col gap-8 overflow-y-auto hide-scrollbar">

        <!-- DOB INPUT SECTION -->
        <section class="bg-white/40 border-2 border-dashed border-black/10 rounded-[2.5rem] p-6 flex flex-col items-center gap-4">
          <div class="text-[11px] font-black uppercase tracking-widest text-black/50 italic">
            When is your birthday?
          </div>

          <SketchDatePicker v-model="dobValue" />

          <p class="text-[12px] font-bold text-black/40 italic text-center leading-snug px-2">
            Required for safe spaces. You can change this later in settings.
          </p>
        </section>

        <!-- COMMUNITY VIBES REDESIGNED -->
        <section>
          <div class="flex items-center gap-3 mb-6 px-2">
            <div class="h-0.5 flex-1 bg-black/5 rounded-full"></div>
            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-black/30">Community Rules</p>
            <div class="h-0.5 flex-1 bg-black/5 rounded-full"></div>
          </div>

          <div class="space-y-4">
            <div
              v-for="rule in WELCOME_RULES" :key="rule.title"
              class="bg-white/60 border border-black/5 p-4 rounded-[2rem] flex gap-4 items-center shadow-sm"
            >
              <div class="w-12 h-12 rounded-[1.25rem] bg-white shadow-inner flex items-center justify-center shrink-0 text-2xl rotate-[-3deg]">
                {{ rule.emoji }}
              </div>
              <div>
                <p class="font-black text-lg text-black leading-none">{{ rule.title }}</p>
                <p class="text-black/60 font-bold text-[12px] mt-1">{{ rule.body }}</p>
              </div>
            </div>
          </div>
        </section>

        <!-- ACKNOWLEDGMENT CHECKBOX -->
        <button
          type="button"
          @click="agreed = !agreed"
          class="flex items-center gap-4 p-5 rounded-[2.5rem] transition-all text-left group"
          :class="agreed ? 'bg-secondary/10 border-2 border-secondary shadow-md' : 'bg-white/40 border-2 border-white'"
        >
          <div
            class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all border-2 border-black/10"
            :class="agreed ? 'bg-secondary border-secondary' : 'bg-white'"
          >
            <ion-icon v-if="agreed" :icon="svg(mdiCheck)" class="text-white text-xl" />
          </div>
          <p class="text-[14px] font-bold leading-tight text-black flex-1 italic group-active:scale-[0.98] transition-transform">
            I agree to the community rules and will treat artists with respect.
          </p>
        </button>
      </div>

      <!-- FOOTER -->
      <div class="px-6 pb-10 pt-4 flex flex-col items-center gap-3 shrink-0">
        <ion-button
          shape="round"
          color="secondary"
          size="large"
          class="w-full max-w-sm h-16 text-lg font-black uppercase tracking-widest shadow-[0_8px_0_rgba(0,0,0,0.1)] m-0"
          :disabled="!isValidDob || !agreed || isSubmitting"
          @click="handleContinue"
        >
          <ion-spinner v-if="isSubmitting" name="dots" />
          <span v-else>Enter Sketchmate</span>
        </ion-button>
      </div>
    </div>
  </ion-content>
</template>

<script setup lang="ts">
import {
	IonButton,
	IonContent,
	IonIcon,
	IonSpinner,
	useIonRouter,
} from "@ionic/vue";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { mdiCheck } from "@mdi/js";
import { useAuthStore } from "@/store/auth.store";
import { svg, isOldEnough, isNative } from "@/helper/general.helper";
import { updateUser } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import LoginNotificationPage from "@/components/login/LoginNotificationPage.vue";
import SketchDatePicker from "@/components/general/SketchDatePicker.vue";
import { FRONTEND_ROUTES } from "@/types/router.types"; // Adjust path as needed

const { user } = storeToRefs(useAuthStore());
const { toast } = useToast();

const dobValue = ref<string | undefined>();
const agreed = ref(false);
const isSubmitting = ref(false);

const isValidDob = computed(() => !!dobValue.value);

const WELCOME_RULES = [
	{
		emoji: "🎨",
		title: "Make art freely",
		body: "Weird, personal, expressive — that's what we're here for.",
	},
	{
		emoji: "🤝",
		title: "Respect artists",
		body: "No harassment, hate speech, or targeted drama.",
	},
	{
		emoji: "🚫",
		title: "Keep it safe",
		body: "No sexual, intense violence, or illegal elements.",
	},
	{
		emoji: "🔒",
		title: "Protect privacy",
		body: "Don't share real names, addresses, or phone lines.",
	},
];

const ionRouter = useIonRouter();
async function handleContinue() {
	if (!isValidDob.value || !agreed.value || isSubmitting.value) return;
	if (!user.value || !dobValue.value) {
		toast("Something went wrong, please try again", { color: "danger" });
		return;
	}

	isSubmitting.value = true;

	try {
		await updateUser({
			_id: user.value._id,
			date_of_birth: dobValue.value,
		});

		user.value.date_of_birth = dobValue.value;

		if (!isOldEnough(dobValue.value)) {
			toast(
				"Social features are hidden until you're older, you can still draw and save work locally.",
				{ color: "warning", duration: 5000 },
			);
		}

		const navEl = document.querySelector("ion-nav");
		if (navEl) {
			if (isNative()) {
				await (navEl as any).push(LoginNotificationPage);
			} else {
				ionRouter.push(FRONTEND_ROUTES.home);
			}
		}
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