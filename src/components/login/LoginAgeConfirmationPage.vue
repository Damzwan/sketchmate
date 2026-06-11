<template>
  <ion-content class="bg-primary my-safe-area cabin-sketch-regular">
    <div class="w-full min-h-full flex flex-col">

      <div class="px-8 pt-10 pb-6 text-center shrink-0">
        <h1 class="text-4xl text-black font-black uppercase tracking-tight leading-none">
          Safety & Community
        </h1>
        <p class="text-[10px] font-black opacity-50 uppercase tracking-[0.2em] mt-2">
          Verify age before access
        </p>
      </div>

      <div class="flex-1 px-5 pb-8 flex flex-col gap-6 overflow-y-auto hide-scrollbar">

        <section class="bg-white/50 border border-primary/20 rounded-[2rem] p-5 flex flex-col items-center gap-3 shadow-sm">
          <div class="text-[10px] font-black uppercase tracking-widest text-black/40 leading-none">
            Date of Birth
          </div>

          <SketchDatePicker v-model="dobValue" />
        </section>

        <section>
          <div class="flex items-center gap-3 mb-4 px-1">
            <div class="h-px flex-1 bg-primary/10"></div>
            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-black/40">Community Rules</p>
            <div class="h-px flex-1 bg-primary/10"></div>
          </div>

          <div class="space-y-2.5">
            <div
              v-for="rule in WELCOME_RULES" :key="rule.title"
              class="bg-white/50 border border-primary/10 p-3.5 rounded-2xl flex gap-3 items-start shadow-sm"
            >
              <div class="w-9 h-9 rounded-xl bg-black/5 flex items-center justify-center shrink-0 text-lg pt-0.5">
                {{ rule.emoji }}
              </div>
              <div class="text-xs">
                <p class="font-black text-black leading-tight">{{ rule.title }}</p>
                <p class="text-black/60 font-medium leading-snug mt-0.5">{{ rule.body }}</p>
              </div>
            </div>
          </div>
        </section>

        <button
          type="button"
          @click="agreed = !agreed"
          class="flex items-start gap-3 p-4 rounded-2xl transition-all text-left bg-white/50 border border-primary/10 shadow-sm group active:bg-white/80"
          :class="{'ring-2 ring-secondary/40 border-secondary/40': agreed}"
        >
          <div
            class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all border border-primary/20 mt-0.5"
            :class="agreed ? 'bg-secondary border-secondary' : 'bg-white'"
          >
            <ion-icon v-if="agreed" :icon="svg(mdiCheck)" class="text-white text-base" />
          </div>
          <p class="text-xs font-bold leading-snug text-black flex-1">
            I agree to these community boundaries and understand violations result in progressive account restrictions.
          </p>
        </button>
      </div>

      <div class="px-6 pb-10 pt-4 flex flex-col items-center gap-3 shrink-0">
        <ion-button
          shape="round"
          color="secondary"
          size="large"
          class="w-full max-w-sm h-14 text-xl font-black uppercase tracking-wider shadow-sm m-0"
          :disabled="!isValidDob || !agreed || isSubmitting"
          @click="handleContinue"
        >
          <ion-spinner v-if="isSubmitting" name="crescent" class="text-white" />
          <span v-else>Enter Sketchmate</span>
        </ion-button>
      </div>
    </div>
  </ion-content>
</template>

<script setup lang="ts">
import { IonButton, IonContent, IonIcon, IonSpinner } from "@ionic/vue";
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { mdiCheck } from "@mdi/js";
import { useAuthStore } from "@/store/auth.store";
import { svg, isOldEnough } from "@/helper/general.helper";
import { updateUser } from "@/service/api/user.api";
import { useToast } from "@/service/toast.service";
import LoginNotificationPage from "@/components/login/LoginNotificationPage.vue";
import SketchDatePicker from "@/components/general/SketchDatePicker.vue";

const { user } = storeToRefs(useAuthStore());
const { toast } = useToast();

const dobValue = ref<string | undefined>();
const agreed = ref(false);
const isSubmitting = ref(false);

const isValidDob = computed(() => !!dobValue.value);

const WELCOME_RULES = [
	{
		emoji: "🎨",
		title: "Harassment",
		body: "Targeted behavior, bullying, or tracking sketches meant to threaten are prohibited.",
	},
	{
		emoji: "🚫",
		title: "Explicit Material",
		body: "Adult, sexual, or overtly graphic illustrations are removed instantly.",
	},
	{
		emoji: "🛡️",
		title: "Minor Safety",
		body: "Any material placing underage accounts at risk results in permanent closures.",
	},
	{
		emoji: "🙅",
		title: "Hate Speech",
		body: "Slurs or attacks targeting group identity profiles are not tolerated.",
	},
];

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
			await (navEl as any).push(LoginNotificationPage);
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