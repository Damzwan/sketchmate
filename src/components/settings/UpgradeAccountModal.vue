<template>
  <ion-modal
    ref="modal"
    :trigger="required ? undefined : trigger"
    :is-open="required"
    :backdrop-dismiss="!required"
    :can-dismiss="!required"
    class="upgrade-account-modal"
  >
    <ion-content class="bg-background cabin-sketch-regular">

      <!-- Header (shop-style: safe-area top + mdi back button) -->
      <div
        class="sticky top-0 z-50 flex items-center gap-1 px-2 pb-3 bg-background"
        :style="{ paddingTop: 'calc(8px + var(--ion-safe-area-top, 0px))' }"
      >
        <ion-button v-if="!required" fill="clear" class="m-0 active:scale-90 transition-transform" @click="modalController.dismiss()">
          <ion-icon :icon="svg(mdiChevronLeft)" class="text-[26px] text-black" slot="icon-only" />
        </ion-button>
        <h1 class="text-2xl font-light text-black leading-none">Save your progress</h1>
      </div>

      <!-- Body -->
      <div class="px-5 pb-8 bot-pad-safe flex flex-col items-center">
<img width="256" height="256" loading="lazy" decoding="async" :src="connectImage" class="w-64 h-64 object-contain anim-float" alt="friends connect" />
        <p class="text-base text-black text-center max-w-[300px] leading-snug mb-6">
          Link your guest profile to an email or Google so your art and progress are never lost.
        </p>

        <!-- Form -->
        <form class="w-full max-w-[340px] flex flex-col gap-3" @keyup.enter="onEmailLoginSubmit">

            <!-- Email -->
            <div class="flex flex-col gap-1">
              <ion-input
                v-model="state.loginEmail"
                @ionBlur="v$.loginEmail.$validate()"
                fill="outline"
                color="secondary"
                type="email"
                placeholder="sketcher@gmail.com"
                :class="{ 'ion-invalid ion-touched': v$.loginEmail.$errors.length }"
              >
                <ion-icon slot="start" :icon="svg(mdiEmailOutline)" class="text-xl text-black/40" />
              </ion-input>
              <span v-if="v$.loginEmail.$errors.length" class="text-[11px] font-bold text-red-500 ml-2">
                {{ v$.loginEmail.$errors[0].$message }}
              </span>
            </div>

            <!-- Password -->
            <div class="flex flex-col gap-1">
              <ion-input
                v-model="state.password"
                @ionBlur="v$.password.$validate()"
                fill="outline"
                color="secondary"
                type="password"
                placeholder="Password"
                :class="{ 'ion-invalid ion-touched': v$.password.$errors.length }"
              >
                <ion-icon slot="start" :icon="svg(mdiLockOutline)" class="text-xl text-black/40" />
                <ion-input-password-toggle slot="end" color="secondary" />
              </ion-input>
              <span v-if="v$.password.$errors.length" class="text-[11px] font-bold text-red-500 ml-2">
                {{ v$.password.$errors[0].$message }}
              </span>
            </div>

            <!-- Confirm Password -->
            <div class="flex flex-col gap-1">
              <ion-input
                v-model="state.confirmPassword"
                @ionBlur="v$.confirmPassword.$validate()"
                fill="outline"
                color="secondary"
                type="password"
                placeholder="Confirm password"
                :class="{ 'ion-invalid ion-touched': v$.confirmPassword.$errors.length }"
              >
                <ion-icon slot="start" :icon="svg(mdiLockOutline)" class="text-xl text-black/40" />
                <ion-input-password-toggle slot="end" color="secondary" />
              </ion-input>
              <span v-if="v$.confirmPassword.$errors.length" class="text-[11px] font-bold text-red-500 ml-2">
                {{ v$.confirmPassword.$errors[0].$message }}
              </span>
            </div>

            <span v-if="loginErrorMsg" class="text-sm font-bold text-red-500 text-center mt-1">{{ loginErrorMsg }}</span>

            <!-- Email Submit -->
            <ion-button expand="block" shape="round" color="secondary" size="large" class="mt-2" @click="onEmailLoginSubmit">
              Continue with email
              <ion-icon slot="end" :icon="svg(mdiSend)" v-if="!loginLoading" />
              <ion-spinner name="crescent" slot="end" class="ml-2 text-white" v-else />
            </ion-button>

            <!-- Divider -->
            <div class="relative flex items-center justify-center my-1">
              <div class="absolute inset-0 flex items-center">
                <div class="w-full border-t border-black/10"></div>
              </div>
              <span class="relative bg-background px-3 text-[11px] uppercase tracking-widest text-black/40">Or</span>
            </div>

            <!-- Google Submit -->
            <ion-button expand="block" fill="outline" shape="round" color="secondary" size="large" @click="onGoogleLogin">
              <ion-icon slot="start" :icon="svg(mdiGoogle)" />
              Continue with Google
              <ion-spinner name="crescent" slot="end" color="secondary" v-if="googleloading" />
            </ion-button>

        </form>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
	IonButton,
	IonContent,
	IonIcon,
	IonInput,
	IonInputPasswordToggle,
	IonModal,
	IonSpinner,
	modalController,
} from "@ionic/vue";
import {
	mdiChevronLeft,
	mdiEmailOutline,
	mdiGoogle,
	mdiLockOutline,
	mdiSend,
} from "@mdi/js";
import { useCredentialsValidation } from "@/composables/general/useCredentialsValidation";
import { svg } from "@/helper/general.helper";

withDefaults(
	defineProps<{
		trigger?: string;
		required?: boolean;
	}>(),
	{
		trigger: "openUpgradeAccountModal",
		required: false,
	},
);

import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import connectImage from "@/assets/illustrations/connect.webp";
import { finalizeGuestRecovery } from "@/service/guestRecovery.service";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { ToastDuration } from "@/types/toast.types";

const { toast } = useToast();
const authStore = useAuthStore();
const { firebaseUser } = storeToRefs(authStore);

const { state, v$ } = useCredentialsValidation();
const loginErrorMsg = ref("");

const isRegisterInvalid = computed(
	() =>
		v$.value.loginEmail.$invalid ||
		v$.value.password.$invalid ||
		v$.value.confirmPassword.$invalid,
);

const loginLoading = ref(false);
const googleloading = ref(false);

async function onEmailLoginSubmit() {
	await v$.value.$validate();
	if (isRegisterInvalid.value) return;

	try {
		loginLoading.value = true;
		const { user } = await FirebaseAuthentication.getCurrentUser();
		const params = { email: state.loginEmail, password: state.password };

		if (user) {
			await FirebaseAuthentication.linkWithEmailAndPassword(params);
			await finalizeGuestRecovery();
			await authStore.completeGuestRecoveryLink();
			modalController.dismiss();
			firebaseUser.value!.isAnonymous = false;
			toast("Account linked successfully!");
		}
	} catch (e: any) {
		if (
			e.code === "auth/email-already-in-use" ||
			e.message?.includes("email-already-in-use")
		) {
			loginErrorMsg.value =
				"That email already belongs to another SketchMate account. Use a different email or contact support to merge the accounts.";
		} else {
			console.error("Auth Error:", e);
			loginErrorMsg.value = "Something went wrong. Please try again later.";
		}
	} finally {
		loginLoading.value = false;
	}
}

async function onGoogleLogin() {
	googleloading.value = true;
	try {
		// This must be a link operation, not a normal Google sign-in. A sign-in can
		// replace the anonymous native Firebase session before it is linked, which
		// strands the guest profile we are trying to protect.
		await FirebaseAuthentication.linkWithGoogle();
		await finalizeGuestRecovery();
		await authStore.completeGuestRecoveryLink();
		modalController.dismiss();
		firebaseUser.value!.isAnonymous = false;
		toast("Account linked successfully!");
	} catch (e) {
		toast("Something went wrong, try again later", {
			color: "danger",
			duration: ToastDuration.medium,
		});
	} finally {
		googleloading.value = false;
	}
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

ion-modal.upgrade-account-modal {
  --background: var(--ion-color-background);
}
@media (min-width: 768px) {
  ion-modal.upgrade-account-modal {
    --border-radius: 2.5rem;
    --width: 440px;
    --height: 80%;
  }
}

ion-input {
  --border-radius: 1.25rem;
  --padding-start: 0.9rem;
  --padding-end: 0.9rem;
  font-weight: 600;
}

@keyframes floatAnim {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.anim-float {
  animation: floatAnim 5s ease-in-out infinite;
}
</style>
