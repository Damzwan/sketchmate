<template>
  <ion-modal ref="modal" trigger="openUpgradeAccountModal">
    <ion-header>
      <ion-toolbar color="tertiary">
        <ion-buttons slot="start">
          <ion-button color="dark" @click="modalController.dismiss()">
            <ion-icon slot="icon-only" :icon="svg(mdiArrowLeft)" />
          </ion-button>
        </ion-buttons>
        <ion-title>Upgrade Account</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content color="tertiary">
      <div class="flex flex-col w-full h-full">
        <div class="flex flex-col flex-grow text-center px-4 py-4 justify-center">
          <img :src="connectImage" class="md:w-[50%] max-w-[400px] w-[90%] mx-auto" alt="friends connect" />
          <p class="text-2xl font-semibold mb-1">Connect Your Account</p>
          <p class="text-sm max-w-md mx-auto">
            Connect your guest account to avoid losing your progress.
          </p>
        </div>


        <div class="flex justify-center items-center flex-col">
          <form class="flex flex-col gap-3 mx-auto max-w-md"
                @keyup.enter="onEmailLoginSubmit">
            <div :class="{ error: v$.loginEmail.$errors.length }" class="flex flex-col">

              <ion-input
                color="secondary"
                fill="outline"
                v-model="state.loginEmail"
                @ionBlur="v$.loginEmail.$validate()"
                ref="mailInput"
                type="email" placeholder="sketcher@gmail.com">
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
                  fill="outline"
                  type="password">
                  <ion-icon slot="start" :icon="svg(mdiLockOutline)" aria-hidden="true" size="large"
                            class="fill-gray-500" />
                  <ion-input-password-toggle slot="end" color="secondary" />
                </ion-input>
                <div v-for="error of v$.password.$errors" :key="error.$uid">
                  <div class="text-sm text-red-600">{{ error.$message }}</div>
                </div>
              </div>

            </div>

            <div :class="{ error: v$.confirmPassword.$errors.length }" class="flex flex-col">
              <div>
                <ion-input
                  v-model="state.confirmPassword"
                  @ionBlur="v$.confirmPassword.$validate()"
                  placeholder="Confirm Password"
                  color="secondary"
                  fill="outline"
                  type="password">
                  <ion-icon slot="start" :icon="svg(mdiLockOutline)" aria-hidden="true" size="large"
                            class="fill-gray-500" />
                </ion-input>
                <div v-for="error of v$.confirmPassword.$errors" :key="error.$uid">
                  <div class="text-sm text-red-600">{{ error.$message }}</div>
                </div>
              </div>
            </div>

            <div class="text-red-600 text-md">{{ loginErrorMsg }}</div>

          </form>

          <ion-button shape="round" color="secondary" size="large" class="w-5/6 max-w-md mt-4"
                      @click="onEmailLoginSubmit">
            Continue with mail
            <ion-icon slot="end" :icon="svg(mdiSend)" v-if="!loginLoading" />
            <ion-spinner name="crescent" slot="end" class="ml-2 text-white" v-else />
          </ion-button>


          <ion-button shape="round" color="secondary" size="large" class="w-5/6 max-w-md my-4" fill="outline"
                      @click="onGoogleLogin"
          >
            <ion-icon slot="start" :icon="svg(mdiGoogle)" />
            <ion-spinner name="crescent" slot="end" class="ml-2 text-secondary" v-if="googleloading" />
            Continue With Google
          </ion-button>
        </div>
      </div>

    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">

import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonInputPasswordToggle,
  IonModal,
  IonSpinner,
  IonTitle,
  IonToolbar,
  modalController
} from '@ionic/vue'
import { isNative, svg } from '@/helper/general.helper'
import { mdiArrowLeft, mdiEmailOutline, mdiGoogle, mdiLockOutline, mdiSend } from '@mdi/js'
import { computed, reactive, ref } from 'vue'
import { email, minLength, required, sameAs } from '@vuelidate/validators'
import { useVuelidate } from '@vuelidate/core'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { EmailAuthProvider, getAuth, GoogleAuthProvider, linkWithCredential } from 'firebase/auth'
import { ToastDuration } from '@/types/toast.types'
import { useToast } from '@/service/toast.service'
import connectImage from '@/assets/illustrations/connect.webp'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'

const { toast } = useToast()

const { firebaseUser } = storeToRefs(useAuthStore())


const state = reactive({
  loginEmail: '',
  password: '',
  confirmPassword: ''
})
const loginErrorMsg = ref('')

const confirmRef = computed(() => state.password)

const rules = {
  loginEmail: { required, email },
  password: { required, minLength: minLength(8) },
  confirmPassword: { required, minLength: minLength(8), confirmRef: sameAs(confirmRef) }
}
const v$ = useVuelidate(rules, state)
const isRegisterInvalid = computed(() => v$.value.loginEmail.$invalid || v$.value.password.$invalid || v$.value.confirmPassword.$invalid)


const loginLoading = ref(false)
const googleloading = ref(false)

async function onEmailLoginSubmit() {
  await v$.value.$validate()
  if (isRegisterInvalid.value) return

  try {
    loginLoading.value = true

    // 1. Check if there is a current anonymous user
    const { user } = await FirebaseAuthentication.getCurrentUser()

    const params = {
      email: state.loginEmail,
      password: state.password
    }

    if (user && user.isAnonymous) {
      // 2. Link the anonymous account to email credentials
      await FirebaseAuthentication.linkWithEmailAndPassword(params)

      modalController.dismiss()
      firebaseUser.value!.isAnonymous = false
      toast('Account linked')

    }

  } catch (e: any) {
    // Capacitor plugin errors usually return a 'code' property
    if (e.code === 'auth/email-already-in-use' || e.message?.includes('email-already-in-use')) {
      loginErrorMsg.value = 'Account already exists, try logging in instead.'
    } else {
      console.error('Auth Error:', e)
      loginErrorMsg.value = 'Something went wrong. Please try again later.'
    }
  } finally {
    loginLoading.value = false
  }
}

async function onGoogleLogin() {
  googleloading.value = true
  try {
    const result = await FirebaseAuthentication.signInWithGoogle()
    const idToken = result.credential?.idToken
    if (!idToken) throw new Error('Missing Google ID Token')
    const auth = getAuth()
    const googleCredential = GoogleAuthProvider.credential(idToken)
    const user = auth.currentUser
    if (!user) throw new Error('Missing user')

    await linkWithCredential(user, googleCredential)
    modalController.dismiss()
    firebaseUser.value!.isAnonymous = false
    toast('Account linked')

  } catch (e) {
    toast('Something went wrong, try again later', { color: 'danger', duration: ToastDuration.medium })
    googleloading.value = false
  }
}


</script>

<style scoped>

</style>