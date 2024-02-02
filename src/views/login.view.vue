<template>
  <ion-page>
    <ion-content>

      <CircularLoader v-if="loading" class="z-50" />
      <div class="w-full h-full" v-else>
        <img :src="blob1" class="absolute right-[-126px] top-[-135px]" alt="Girl drawing" width="400" />

        <div class="w-full flex-col flex justify-center absolute bottom-48 login-container">
          <img :src="girlDrawing" class="w-full md:h-[26rem] sm:h-[24rem]" alt="Girl drawing" />
          <div class="w-full flex flex-col justify-center items-center">
            <h1 class="text-2xl md:text-3xl font-bold">Welcome to SketchMate</h1>

            <p class="px-5 text-center text-lg md:text-xl pb-2">Sketch your day, share with your friends</p>
            <ion-popover trigger="sign_phone" side="top" alignment="center" mode="md" @didDismiss="onDismiss"
                         :keep-contents-mounted="true">
              <div class="w-full h-full flex justify-center items-center z-50 bg-background absolute"
                   v-show="loginLoading">
                <ion-spinner color="secondary" />
              </div>
              <div class="p-3 bg-background">
                <h1 class="pl-1 pb-4 text-lg font-bold">
                  {{ forgotPassword ? 'Reset password' : (isRegistering ? 'Register' : 'Login') }}
                </h1>
                <form @keyup.enter="onFormSubmit">
                  <div class="flex justify-center items-center" v-if="forgotPassword">
                    <div v-if="!forgotPasswordSent">
                      <div :class="{ error: v$.loginEmail.$errors.length }" class="w-[250px]">
                        <ion-input
                          label="E-mail"
                          color="secondary"
                          label-placement="stacked"
                          fill="outline"
                          v-model="state.loginEmail"
                          @ionBlur="v$.loginEmail.$validate()"
                          ref="mailInput"
                          type="email" placeholder="sketcher@gmail.com">
                        </ion-input>
                        <div v-for="error of v$.loginEmail.$errors" :key="error.$uid">
                          <div class="text-sm text-red-600">{{ error.$message }}</div>
                        </div>
                      </div>
                    </div>
                    <p v-else class="text-sm text-green-600">Password reset link sent to {{ state.loginEmail }}</p>

                    <div class="flex flex-grow justify-center items-center" v-if="!forgotPasswordSent">
                      <ion-button class="pl-2" color="secondary" fill="clear"
                                  :disabled="isForgetPasswordInvalid"
                                  @click="onPasswordForget">
                        <ion-icon slot="icon-only" :icon="svg(mdiSend)"></ion-icon>
                      </ion-button>
                    </div>


                  </div>
                  <div class="flex justify-center items-center" v-else>
                    <div>
                      <div :class="{ error: v$.loginEmail.$errors.length }" class="w-[250px]">
                        <ion-input
                          label="E-mail"
                          color="secondary"
                          label-placement="stacked"
                          fill="outline"
                          v-model="state.loginEmail"
                          @ionBlur="v$.loginEmail.$validate()"
                          ref="mailInput"
                          type="email" placeholder="sketcher@gmail.com">
                        </ion-input>
                        <div v-for="error of v$.loginEmail.$errors" :key="error.$uid">
                          <div class="text-sm text-red-600">{{ error.$message }}</div>
                        </div>
                      </div>

                      <div :class="{ error: v$.password.$errors.length }" class="w-[250px]">
                        <ion-input
                          v-model="state.password"
                          @ionBlur="v$.password.$validate()"
                          class="my-3"
                          label="Password"
                          color="secondary"
                          label-placement="stacked"
                          fill="outline"
                          type="password">
                        </ion-input>
                        <div v-for="error of v$.password.$errors" :key="error.$uid">
                          <div class="text-sm text-red-600">{{ error.$message }}</div>
                        </div>
                      </div>

                      <div :class="{ error: v$.confirmPassword.$errors.length }" class="w-[250px]" v-if="isRegistering">
                        <ion-input
                          v-model="state.confirmPassword"
                          @ionBlur="v$.confirmPassword.$validate()"
                          class="my-3"
                          label="Confirm password"
                          color="secondary"
                          label-placement="stacked"
                          fill="outline"
                          type="password">
                        </ion-input>
                        <div v-for="error of v$.confirmPassword.$errors" :key="error.$uid">
                          <div class="text-sm text-red-600">{{ error.$message }}</div>
                        </div>
                      </div>

                    </div>
                    <div class="flex flex-grow justify-center items-center">
                      <ion-button class="pl-2" color="secondary" fill="clear"
                                  :disabled="isRegistering ? isRegisterInvalid : isLoginInValid"
                                  @click="onEmailLoginSubmit">
                        <ion-icon slot="icon-only" :icon="svg(mdiSend)"></ion-icon>
                      </ion-button>
                    </div>
                  </div>

                  <div v-if="forgotPassword">
                    <ion-button fill="clear" color="secondary" size="small" class="forgot-password py-1"
                                @click="forgotPassword=false">Back to login
                    </ion-button>
                  </div>

                  <div v-else-if="isRegistering">
                    <ion-button fill="clear" color="secondary" size="small" class="forgot-password py-1"
                                @click="isRegistering=false">Back to login
                    </ion-button>
                  </div>

                  <div class="py-2" v-else>
                    <div>
                      <ion-button fill="clear" color="secondary" size="small" class="forgot-password py-1"
                                  @click="isRegistering=true">New account?
                      </ion-button>
                    </div>


                    <ion-button fill="clear" color="secondary" size="small" class="forgot-password py-1"
                                @click="forgotPassword=true">Forgot
                      password?
                    </ion-button>
                  </div>
                  <div class="text-red-600 text-sm">{{ loginErrorMsg }}</div>

                </form>
              </div>
            </ion-popover>
            <ion-button color="secondary" class="pt-2 w-[220px]" mode="md" id="sign_phone">Sign in with mail
              <ion-icon slot="start" :icon="svg(mdiEmail)"></ion-icon>
            </ion-button>
            <ion-button color="light" @click="onGoogleLogin" class="pt-2 w-[220px]" mode="md">Sign in with Google
              <ion-icon slot="start" :icon="google"></ion-icon>
            </ion-button>

          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonPage,
  IonPopover,
  IonSpinner,
  popoverController
} from '@ionic/vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import CircularLoader from '@/components/loaders/CircularLoader.vue'
import girlDrawing from '@/assets/illustrations/girl_drawing.svg'
import blob1 from '@/assets/illustrations/blob1.svg'
import { useToast } from '@/service/toast.service'
import { FirebaseAuthentication, SignInResult } from '@capacitor-firebase/authentication'
import { ToastDuration } from '@/types/toast.types'
import { isNative, svg } from '@/helper/general.helper'
import { Preferences } from '@capacitor/preferences'
import { LocalStorage } from '@/types/storage.types'
import { mdiEmail, mdiSend } from '@mdi/js'
import google from '@/assets/google.svg'
import { email, minLength, required, sameAs } from '@vuelidate/validators'
import { useVuelidate } from '@vuelidate/core'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'

const { toast } = useToast()


const loading = ref(false)
const mailInput = ref()
const loginErrorMsg = ref('')
const loginLoading = ref(false)
const forgotPassword = ref(false)
const forgotPasswordSent = ref(false)

const state = reactive({
  loginEmail: '',
  password: '',
  confirmPassword: ''
})

const confirmRef = computed(() => state.password)

const rules = {
  loginEmail: { required, email },
  password: { required, minLength: minLength(8) },
  confirmPassword: { required, minLength: minLength(8), confirmRef: sameAs(confirmRef) }
}


const v$ = useVuelidate(rules, state)
const isLoginInValid = computed(() => v$.value.loginEmail.$invalid || v$.value.password.$invalid)
const isForgetPasswordInvalid = computed(() => v$.value.loginEmail.$invalid)
const isRegisterInvalid = computed(() => v$.value.loginEmail.$invalid || v$.value.password.$invalid || v$.value.confirmPassword.$invalid)
const isRegistering = ref(false)
const { queryParams } = storeToRefs(useAppStore())


watch(queryParams, value => {
  if (value) checkQueryParams()
})
onMounted(checkQueryParams)

// reset the error messages
watch([isRegistering, forgotPassword], () => {
  v$.value.$reset()
  loginErrorMsg.value = ''
})


async function checkQueryParams() {
  const emailLink = window.location.href
  const { isSignInWithEmailLink } =
    await FirebaseAuthentication.isSignInWithEmailLink({
      emailLink
    })

  if (!isSignInWithEmailLink) {
    return
  }

  const mail = await Preferences.get({ key: LocalStorage.emailForSignIn })
  if (!mail.value) return


  const result = await FirebaseAuthentication.signInWithEmailLink({
    email: mail.value,
    emailLink
  })

  await onLoginResult(result)
}

function onFormSubmit() {
  forgotPassword.value ? onPasswordForget() : onEmailLoginSubmit()
}

async function onPasswordForget() {
  try {
    await v$.value.$validate()
    if (isForgetPasswordInvalid.value) return
    loginLoading.value = true
    await FirebaseAuthentication.sendPasswordResetEmail({
      email: state.loginEmail
    })
    forgotPasswordSent.value = true
    loginLoading.value = false
  } catch (e: any) {
    console.log(e.code)
  }
}

async function onEmailLoginSubmit() {
  Preferences.set({ key: LocalStorage.login, value: 'true' })
  await v$.value.$validate()

  if (isRegistering.value) {
    if (isRegisterInvalid.value) return
    try {
      loginLoading.value = true
      const result = await FirebaseAuthentication.createUserWithEmailAndPassword({
        email: state.loginEmail,
        password: state.password
      })
      await onLoginResult(result)

    } catch (e: any) {
      if (e.code == 'auth/email-already-in-use') loginErrorMsg.value = 'Account already exists, try logging in instead.'
      else if (e.code == 'email-already-in-use') loginErrorMsg.value = 'Account already exists, try logging in instead.'
      else loginErrorMsg.value = 'Something went wrong, please try again later. If this issue persists contact me.'
      loginLoading.value = false
    }
  } else {
    if (isLoginInValid.value) return
    try {
      loginLoading.value = true
      const result = await FirebaseAuthentication.signInWithEmailAndPassword({
        email: state.loginEmail,
        password: state.password
      })
      await onLoginResult(result)
    } catch (e: any) {
      if (e.code == 'auth/invalid-login-credentials') loginErrorMsg.value = 'Account not found or wrong password.'
      else if (e.message.includes('INVALID_LOGIN_CREDENTIALS')) loginErrorMsg.value = 'Account not found or wrong password.' // TODO current hack since the plugin does not return the error code...
      else if (e.code == 'auth/too-many-requests') loginErrorMsg.value = 'Too many attempts, try again later.'
      else loginErrorMsg.value = 'Something went wrong, please try again later. If this issue persists contact me.'
      loginLoading.value = false
    }
  }
}


async function onGoogleLogin() {
  Preferences.set({ key: LocalStorage.login, value: 'true' })
  if (isNative()) setTimeout(() => loading.value = true, 1500)
  else loading.value = true
  try {
    const result = await FirebaseAuthentication.signInWithGoogle()
    await onLoginResult(result)
  } catch (e) {
    toast('Something went wrong, try again later', { color: 'danger', duration: ToastDuration.medium })
    loading.value = false
  }
}

// the watcher in app.store will trigger the reroute
async function onLoginResult(result: SignInResult) {
  popoverController.dismiss()
  if (!result.user) {
    loading.value = false
    toast('Something went wrong, try again later', { color: 'danger', duration: ToastDuration.medium })
    return
  }
}

function onDismiss() {
  loginLoading.value = false
  isRegistering.value = false
  forgotPassword.value = false
  forgotPasswordSent.value = true
  v$.value.$reset()
  loginErrorMsg.value = ''
}


</script>

<style scoped>

@media (max-height: 700px) {
  .login-container {
    @apply bottom-40
  }
}

ion-popover {
  --width: 350px
}

.forgot-password {
  --padding-start: 0
}


</style>