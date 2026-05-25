<template>
  <ion-modal ref="modal" trigger="openUpgradeAccountModal" class="liquid-upgrade-modal">
    <div class="h-full flex flex-col p-5 bot-pad-safe bg-background overflow-y-auto hide-scrollbar relative">

      <!-- Custom Floating Header -->
      <div class="flex items-center justify-between shrink-0 mb-2 z-10">
        <button @click="modalController.dismiss()" class="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center active:scale-90 transition-transform">
          <ion-icon :icon="svg(mdiArrowLeft)" class="text-xl text-black/70" />
        </button>
        <span class="text-xs font-bold uppercase tracking-widest opacity-40">Save Progress</span>
        <div class="w-10"></div> <!-- Flex Spacer -->
      </div>

      <!-- Main Visuals -->
      <div class="flex flex-col flex-grow items-center justify-center -mt-4 cabin-sketch-regular">
        <img :src="connectImage" class="w-52 h-52 object-contain drop-shadow-xl mb-4 anim-float" alt="friends connect" />
        <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none text-center mb-2">
          Connect Account
        </h1>
        <p class="text-sm font-bold text-black/50 text-center max-w-[280px] leading-tight mb-8">
          Link your guest profile to an email or Google to secure your artwork and progress.
        </p>

        <!-- Form Area -->
        <form class="w-full max-w-[320px] flex flex-col gap-3" @keyup.enter="onEmailLoginSubmit">

          <!-- Email Input -->
          <div class="flex flex-col gap-1">
            <ion-input
              v-model="state.loginEmail"
              @ionBlur="v$.loginEmail.$validate()"
              type="email"
              placeholder="sketcher@gmail.com"
              class="liquid-input"
              :class="{ 'error-input': v$.loginEmail.$errors.length }"
            >
              <ion-icon slot="start" :icon="svg(mdiEmailOutline)" class="text-xl text-black/40 mr-2" />
            </ion-input>
            <span v-if="v$.loginEmail.$errors.length" class="text-[11px] font-bold text-red-500 ml-2 uppercase tracking-wide">
              {{ v$.loginEmail.$errors[0].$message }}
            </span>
          </div>

          <!-- Password Input -->
          <div class="flex flex-col gap-1">
            <ion-input
              v-model="state.password"
              @ionBlur="v$.password.$validate()"
              type="password"
              placeholder="Password"
              class="liquid-input"
              :class="{ 'error-input': v$.password.$errors.length }"
            >
              <ion-icon slot="start" :icon="svg(mdiLockOutline)" class="text-xl text-black/40 mr-2" />
              <ion-input-password-toggle slot="end" color="dark" />
            </ion-input>
            <span v-if="v$.password.$errors.length" class="text-[11px] font-bold text-red-500 ml-2 uppercase tracking-wide">
              {{ v$.password.$errors[0].$message }}
            </span>
          </div>

          <!-- Confirm Password Input -->
          <div class="flex flex-col gap-1">
            <ion-input
              v-model="state.confirmPassword"
              @ionBlur="v$.confirmPassword.$validate()"
              type="password"
              placeholder="Confirm Password"
              class="liquid-input"
              :class="{ 'error-input': v$.confirmPassword.$errors.length }"
            >
              <ion-icon slot="start" :icon="svg(mdiLockOutline)" class="text-xl text-black/40 mr-2" />
              <ion-input-password-toggle slot="end" color="dark" />
            </ion-input>
            <span v-if="v$.confirmPassword.$errors.length" class="text-[11px] font-bold text-red-500 ml-2 uppercase tracking-wide">
              {{ v$.confirmPassword.$errors[0].$message }}
            </span>
          </div>

          <span v-if="loginErrorMsg" class="text-sm font-bold text-red-500 text-center mt-2">{{ loginErrorMsg }}</span>

          <!-- Email Submit -->
          <ion-button shape="round" color="secondary" class="h-14 font-black uppercase tracking-widest shadow-lg mt-2" @click="onEmailLoginSubmit">
            Continue with Email
            <ion-icon slot="end" :icon="svg(mdiSend)" v-if="!loginLoading" />
            <ion-spinner name="crescent" slot="end" class="ml-2 text-white" v-else />
          </ion-button>

          <!-- Divider -->
          <div class="relative flex items-center justify-center mt-4 mb-2">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t-2 border-black/5"></div>
            </div>
            <span class="relative bg-background px-4 text-xs font-bold uppercase tracking-widest text-black/30">Or</span>
          </div>

          <!-- Google Submit -->
          <ion-button fill="clear" color="dark" class="h-14 font-black uppercase tracking-widest border-2 border-black/10 rounded-full shadow-sm bg-white/50" @click="onGoogleLogin">
            <ion-icon slot="start" :icon="svg(mdiGoogle)" />
            <ion-spinner name="crescent" slot="end" color="secondary" v-if="googleloading" />
            Continue With Google
          </ion-button>

        </form>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import {
	IonButton,
	IonIcon,
	IonInput,
	IonInputPasswordToggle,
	IonModal,
	IonSpinner,
	modalController,
} from "@ionic/vue";
import { svg } from "@/helper/general.helper";
import {
	mdiArrowLeft,
	mdiEmailOutline,
	mdiGoogle,
	mdiLockOutline,
	mdiSend,
} from "@mdi/js";
import { computed, reactive, ref } from "vue";
import { email, minLength, required, sameAs } from "@vuelidate/validators";
import { useVuelidate } from "@vuelidate/core";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { GoogleAuthProvider, getAuth, linkWithCredential } from "firebase/auth";
import { ToastDuration } from "@/types/toast.types";
import { useToast } from "@/service/toast.service";
import connectImage from "@/assets/illustrations/connect.webp";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/store/auth.store";

const { toast } = useToast();
const { firebaseUser } = storeToRefs(useAuthStore());

const state = reactive({
	loginEmail: "",
	password: "",
	confirmPassword: "",
});
const loginErrorMsg = ref("");

const confirmRef = computed(() => state.password);

const rules = {
	loginEmail: { required, email },
	password: { required, minLength: minLength(8) },
	confirmPassword: {
		required,
		minLength: minLength(8),
		confirmRef: sameAs(confirmRef),
	},
};
const v$ = useVuelidate(rules, state);
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

		if (user && user.isAnonymous) {
			await FirebaseAuthentication.linkWithEmailAndPassword(params);
			modalController.dismiss();
			firebaseUser.value!.isAnonymous = false;
			toast("Account linked successfully!");
		}
	} catch (e: any) {
		if (
			e.code === "auth/email-already-in-use" ||
			e.message?.includes("email-already-in-use")
		) {
			loginErrorMsg.value = "Account already exists, try logging in instead.";
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
		const result = await FirebaseAuthentication.signInWithGoogle();
		const idToken = result.credential?.idToken;
		if (!idToken) throw new Error("Missing Google ID Token");
		const auth = getAuth();
		const googleCredential = GoogleAuthProvider.credential(idToken);
		const user = auth.currentUser;
		if (!user) throw new Error("Missing user");

		await linkWithCredential(user, googleCredential);
		modalController.dismiss();
		firebaseUser.value!.isAnonymous = false;
		toast("Account linked successfully!");
	} catch (e) {
		toast("Something went wrong, try again later", {
			color: "danger",
			duration: ToastDuration.medium,
		});
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

ion-modal.liquid-upgrade-modal {
  --background: var(--ion-color-tertiary);
}
@media (min-width: 768px) {
  ion-modal.liquid-upgrade-modal {
    --border-radius: 2.5rem;
  }
}

/* Customizing the Ionic inputs to look like liquid sketch shapes */
.liquid-input {
  --background: rgba(255, 255, 255, 0.8);
  --padding-start: 1rem;
  --padding-end: 1rem;
  font-weight: 700;
  font-size: 1.1rem;
  color: rgba(0, 0, 0, 0.8);
  min-height: 56px;
  transition: all 0.3s ease;
}

.liquid-input.ion-focused {
  border-color: var(--ion-color-secondary);
  background: #ffffff;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
}

.liquid-input.error-input {
  border-color: rgba(239, 68, 68, 0.5);
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.15);
}

@keyframes floatAnim {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
.anim-float {
  animation: floatAnim 5s ease-in-out infinite;
}
</style>