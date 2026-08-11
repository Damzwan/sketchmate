<template>
  <ion-content class="bg-primary my-safe-area">
    <div class="w-full h-full p-4 flex flex-col justify-between">
      <div>
        <div class="w-fit mx-auto flex items-center relative">
          <p class="cabin-sketch-regular text-5xl">SketchMate</p>
<img width="48" height="48" loading="lazy" decoding="async" :src="logo" alt="" class="w-12 h-12 absolute -mr-12 mb-4 right-0" />
        </div>

        <div class="w-full flex flex-col gap-4 pt-4">
          <LoginMovingDrawingRow :drawings="drawings1" v-if="!isSuperShortScreen || !showLoginScreen" />
          <Transition name="push-up">
            <LoginMovingDrawingRow
              v-if="!isShortScreen || !showLoginScreen"
              :drawings="drawings2"
              direction="right"
            />
          </Transition>
        </div>
      </div>

      <div class="h-full w-full flex flex-col justify-end gap-4 items-center">
        <Transition name="fade">
          <div v-if="showLoginScreen" class="w-full">
            <form v-if="!isPasswordForgotten" class="flex flex-col gap-3 mx-auto max-w-md"
                  @submit.prevent="onEmailLoginSubmit">
              <button type="submit" class="hidden" style="display: none;"></button>
              <div :class="{ error: v$.loginEmail.$errors.length }" class="flex flex-col">

                <ion-input
                  color="secondary"
                  fill="outline"
                  autocomplete="username"
                  v-model="state.loginEmail"
                  @ionBlur="v$.loginEmail.$validate()"
                  name="email"
                  type="email" placeholder="sketcher@gmail.com"
                  class="autofill-override">
                  <ion-icon slot="start" :icon="svg(mdiEmailOutline)" aria-hidden="true" size="large"
                            class="fill-gray-500" />
                </ion-input>
                <div v-for="error of v$.loginEmail.$errors" :key="error.$uid">
                  <div class="text-sm text-red-600">{{ error.$message }}</div>
                </div>
              </div>

              <div :class="{ error: v$.password.$errors.length }" class="flex flex-col">
                <div>
                  <ion-input
                    v-model="state.password"
                    @ionBlur="v$.password.$validate()"
                    color="secondary"
                    placeholder="Password"
                    autocomplete="current-password"
                    name="password"
                    fill="outline"
                    type="password"
                    class="autofill-override">
                    <ion-icon slot="start" :icon="svg(mdiLockOutline)" aria-hidden="true" size="large"
                              class="fill-gray-500" />
                    <ion-input-password-toggle slot="end" color="secondary" />
                  </ion-input>
                  <div v-for="error of v$.password.$errors" :key="error.$uid">
                    <div class="text-sm text-red-600">{{ error.$message }}</div>
                  </div>
                </div>
                <div class="w-full flex justify-between" v-if="!isRegistering && !isPasswordForgotten">
                  <ion-button shape="round" color="secondary" size="small" fill="clear" @click="isRegistering=true">New
                    Account?
                  </ion-button>
                  <ion-button shape="round" color="secondary" size="small" fill="clear"
                              @click="isPasswordForgotten=true">
                    Forgot your password?
                  </ion-button>
                </div>

              </div>

              <div :class="{ error: v$.confirmPassword.$errors.length }" class="flex flex-col" v-if="isRegistering">
                <div>
                  <ion-input
                    v-model="state.confirmPassword"
                    @ionBlur="v$.confirmPassword.$validate()"
                    placeholder="Confirm Password"
                    autocomplete="new-password"
                    color="secondary"
                    fill="outline"
                    type="password"
                    class="autofill-override">
                    <ion-icon slot="start" :icon="svg(mdiLockOutline)" aria-hidden="true" size="large"
                              class="fill-gray-500" />
                  </ion-input>
                  <div v-for="error of v$.confirmPassword.$errors" :key="error.$uid">
                    <div class="text-sm text-red-600">{{ error.$message }}</div>
                  </div>
                </div>


                <div class="w-full flex justify-start">
                  <ion-button shape="round" color="secondary" size="small" fill="clear" @click="isRegistering=false">
                    Back
                    to sign in
                  </ion-button>
                </div>
              </div>

              <div class="text-red-600 text-md">{{ loginErrorMsg }}</div>

            </form>

            <form v-else-if="isPasswordForgotten" @keyup.enter="onPasswordForget"
                  class="flex flex-col gap-3 mx-auto max-w-md">
              <div :class="{ error: v$.loginEmail.$errors.length }" class="flex flex-col">

                <ion-input
                  color="secondary"
                  fill="outline"
                  v-model="state.loginEmail"
                  @ionBlur="v$.loginEmail.$validate()"
                  type="email" placeholder="sketcher@gmail.com"
                  class="autofill-override">
                  <ion-icon slot="start" :icon="svg(mdiEmailOutline)" aria-hidden="true" size="large"
                            class="fill-gray-500" />
                </ion-input>
                <div v-for="error of v$.loginEmail.$errors" :key="error.$uid">
                  <div class="text-sm text-red-600">{{ error.$message }}</div>
                </div>
                <div class="w-full flex justify-start">
                  <ion-button shape="round" color="secondary" size="small" fill="clear"
                              @click="isPasswordForgotten=false">Back
                    to sign in
                  </ion-button>
                </div>
              </div>


            </form>

          </div>


        </Transition>

        <ion-button shape="round" color="secondary" size="large" class="w-5/6 max-w-md cabin-sketch-regular" @click="showLoginScreen=true"
                    v-if="!showLoginScreen">
          <ion-icon slot="start" class="mr-2" :icon="svg(mdiEmail)" />
          Sign in
        </ion-button>

        <ion-button shape="round" color="secondary" size="large" class="w-5/6 max-w-md cabin-sketch-regular" @click="onEmailLoginSubmit"
                    v-else-if="showLoginScreen && !isPasswordForgotten">

          <ion-icon slot="end" class="ml-2" :icon="svg(mdiSend)" v-if="!loginLoading" />
          <ion-spinner name="crescent" slot="end" class="ml-2 text-white" v-else />
          {{ isRegistering ? 'Sign up' : 'Sign in' }}
        </ion-button>

        <ion-button shape="round" color="secondary" size="large" class="w-5/6 max-w-md cabin-sketch-regular" @click="onPasswordForget"
                    v-else-if="showLoginScreen && isPasswordForgotten">

          <ion-icon slot="end" class="ml-2" :icon="svg(mdiSend)" v-if="!loginLoading" />
          <ion-spinner name="crescent" slot="end" class="ml-2 text-white" v-else />

          Reset password
        </ion-button>

        <ion-button shape="round" color="secondary" size="large" class="w-5/6 max-w-md cabin-sketch-regular" fill="outline"
                    @click="onGoogleLogin">
          <ion-icon slot="start" class="mr-2" :icon="svg(mdiGoogle)" />
          <ion-spinner name="crescent" slot="end" class="ml-2 text-secondary" v-if="googleloading" />
          Continue With Google
        </ion-button>
        <ion-button shape="round" color="secondary" size="large" class="w-5/6 max-w-md cabin-sketch-regular" fill="clear"
                    @click="isAnonymousConfirmationOpen=true">Continue
          <ion-spinner name="crescent" slot="end" class="ml-2 text-secondary" v-if="anonymousLoading" />
          As Anonymous
        </ion-button>

      </div>
    </div>


    <ConfirmationAlert
      v-model:is-open="isAnonymousConfirmationOpen"
      confirmationtext="Create anonymous account"
      header="Anonymous Login"
      message="You won't be able to access this account on other devices or after logout. You can upgrade later."
      @confirm="onAnonymousLogin"
    />

  </ion-content>
</template>

<script setup lang="ts">
import {
	IonButton,
	IonContent,
	IonIcon,
	IonInput,
	IonInputPasswordToggle,
	IonSpinner,
} from "@ionic/vue";
import {
	mdiEmail,
	mdiEmailOutline,
	mdiGoogle,
	mdiLockOutline,
	mdiSend,
} from "@mdi/js";
import { onMounted, ref } from "vue";
import drawing1 from "@/assets/login_images/1.webp";
import drawing2 from "@/assets/login_images/2.webp";
import drawing3 from "@/assets/login_images/3.webp";
import drawing4 from "@/assets/login_images/4.webp";
import drawing5 from "@/assets/login_images/5.webp";
import drawing6 from "@/assets/login_images/6.webp";
import drawing7 from "@/assets/login_images/7.webp";
import drawing8 from "@/assets/login_images/8.webp";
import drawing9 from "@/assets/login_images/9.webp";
import drawing10 from "@/assets/login_images/10.webp";
import drawing11 from "@/assets/login_images/11.webp";
import drawing12 from "@/assets/login_images/12.webp";
import drawing13 from "@/assets/login_images/13.webp";
import drawing14 from "@/assets/login_images/14.webp";
import drawing15 from "@/assets/login_images/15.webp";
import drawing16 from "@/assets/login_images/16.webp";
import drawing17 from "@/assets/login_images/17.webp";
import drawing18 from "@/assets/login_images/18.webp";
import drawing19 from "@/assets/login_images/19.webp";
import drawing20 from "@/assets/login_images/20.webp";
import logo from "@/assets/logo.webp";
import ConfirmationAlert from "@/components/general/ConfirmationAlert.vue";
import LoginMovingDrawingRow from "@/components/login/LoginMovingDrawingRow.vue";
import { shuffleArray, svg } from "@/helper/general.helper";
import { useLoginActions } from "./useLoginActions";

const drawings1 = shuffleArray([
	drawing1,
	drawing2,
	drawing3,
	drawing4,
	drawing5,
	drawing6,
	drawing7,
	drawing8,
	drawing9,
	drawing10,
]);
const drawings2 = shuffleArray([
	drawing11,
	drawing12,
	drawing13,
	drawing14,
	drawing15,
	drawing16,
	drawing17,
	drawing18,
	drawing19,
	drawing20,
]);

const showLoginScreen = ref(false);
const isPasswordForgotten = ref(false);
const isAnonymousConfirmationOpen = ref(false);

const isShortScreen = ref(false);
const isSuperShortScreen = ref(false);

onMounted(() => {
	isShortScreen.value = window.innerHeight < 1200;
	isSuperShortScreen.value = window.innerHeight < 700;
});

const {
	state,
	v$,
	loginErrorMsg,
	loginLoading,
	googleloading,
	anonymousLoading,
	forgotPassword,
	forgotPasswordSent,
	isRegistering,
	isLoginInValid,
	isForgetPasswordInvalid,
	isRegisterInvalid,
	onPasswordForget,
	onEmailLoginSubmit,
	onGoogleLogin,
	onAnonymousLogin,
} = useLoginActions();
</script>

<style scoped>
.fade-enter-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from {
  opacity: 0;
}

.fade-enter-to {
  opacity: 1;
}


</style>

<!--prevents the stupid autofill style-->
<style>
input:-webkit-autofill,
input:-webkit-autofill:focus {
  transition: background-color 0s 600000s, color 0s 600000s !important;
}
</style>
