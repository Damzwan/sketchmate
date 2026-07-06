<template>
  <ion-content :scroll-y="false" class="bg-primary my-safe-area cabin-sketch-regular">
    <div class="w-full h-full flex flex-col">

      <!-- HEADER -->
      <div class="px-8 pt-8 pb-5 text-center shrink-0">
        <h1 class="text-4xl text-black font-bold tracking-tight leading-none">
          Safety & Community
        </h1>
        <p class="text-xs font-bold text-black/80 uppercase tracking-widest mt-3">
          Help us keep Sketchmate safe
        </p>
      </div>

      <!-- SCROLLABLE BODY (only this scrolls) -->
      <div class="flex-1 min-h-0 px-5 pb-4 flex flex-col gap-5 overflow-y-auto hide-scrollbar">

        <!-- DOB INPUT SECTION -->
        <section
          class="bg-tertiary border border-primary/40 rounded-[1.5rem] shadow-sm p-6 flex flex-col items-center gap-4">
          <div class="text-xs font-bold uppercase tracking-widest text-black/80">
            When is your birthday?
          </div>

          <SketchDatePicker v-model="dobValue" />

        </section>

        <!-- COMMUNITY RULES -->
        <section>
          <p class="text-xs font-bold uppercase tracking-widest text-black/80 mb-3 px-1">Community rules</p>

          <div class="bg-tertiary border border-primary/40 rounded-[1.5rem] shadow-sm p-4 space-y-3.5">
            <div
              v-for="rule in WELCOME_RULES" :key="rule.title"
              class="flex gap-3 items-start"
            >
              <div class="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
                <ion-icon :icon="svg(rule.icon)" class="text-xl text-secondary" />
              </div>
              <p class="text-[15px] text-black/80 leading-snug pt-1">
                <strong class="font-bold text-black">{{ rule.title }}</strong> — {{ rule.body }}
              </p>
            </div>
          </div>
        </section>

        <!-- ACKNOWLEDGMENT CHECKBOX -->
        <button
          type="button"
          @click="agreed = !agreed"
          class="flex items-center gap-4 p-4 rounded-[1.5rem] transition-all text-left group"
          :class="agreed ? 'bg-secondary/10 border-2 border-secondary' : 'bg-tertiary border border-primary/40'"
        >
          <div
            class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-all border-2"
            :class="agreed ? 'bg-secondary border-secondary' : 'bg-white border-primary/40'"
          >
            <ion-icon v-if="agreed" :icon="svg(mdiCheck)" class="text-white text-xl" />
          </div>
          <p class="text-[15px] leading-snug text-black/80 flex-1">
            I agree to the community rules and will treat artists with respect.
          </p>
        </button>
      </div>

      <!-- FIXED FOOTER -->
      <div class="px-6 pb-8 pt-4 flex flex-col items-center shrink-0">
        <ion-button
          shape="round"
          color="secondary"
          size="large"
          expand="block"
          class="w-full max-w-sm m-0"
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
  useIonRouter
} from '@ionic/vue'
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  mdiCheck,
  mdiHandshakeOutline,
  mdiLockOutline,
  mdiPalette,
  mdiShieldAlertOutline
} from '@mdi/js'
import { useAuthStore } from '@/store/auth.store'
import { svg, isOldEnough, isNative } from '@/helper/general.helper'
import { updateUser } from '@/service/api/user.api'
import { useToast } from '@/service/toast.service'
import LoginNotificationPage from '@/components/login/LoginNotificationPage.vue'
import SketchDatePicker from '@/components/general/SketchDatePicker.vue'
import { FRONTEND_ROUTES } from '@/types/router.types' // Adjust path as needed

const { user } = storeToRefs(useAuthStore())
const { toast } = useToast()

const dobValue = ref<string | undefined>()
const agreed = ref(false)
const isSubmitting = ref(false)

const isValidDob = computed(() => !!dobValue.value)

const WELCOME_RULES = [
  {
    icon: mdiPalette,
    title: 'Make art freely',
    body: 'Weird, personal, expressive — that\'s what we\'re here for.'
  },
  {
    icon: mdiHandshakeOutline,
    title: 'Respect artists',
    body: 'No harassment, hate speech, or targeted drama.'
  },
  {
    icon: mdiShieldAlertOutline,
    title: 'Keep it safe',
    body: 'No sexual, intense violence, or illegal elements.'
  },
  {
    icon: mdiLockOutline,
    title: 'Protect privacy',
    body: 'Don\'t share real names, addresses, or phone lines.'
  }
]

const ionRouter = useIonRouter()

async function handleContinue() {
  if (!isValidDob.value || !agreed.value || isSubmitting.value) return
  if (!user.value || !dobValue.value) {
    toast('Something went wrong, please try again', { color: 'danger' })
    return
  }

  isSubmitting.value = true

  try {
    await updateUser({
      _id: user.value._id,
      date_of_birth: dobValue.value
    })

    user.value.date_of_birth = dobValue.value

    if (!isOldEnough(dobValue.value)) {
      toast(
        'Social features are hidden until you\'re older, you can still draw and save work locally.',
        { color: 'warning', duration: 5000 }
      )
    }

    const navEl = document.querySelector('ion-nav')
    if (navEl) {
      if (isNative()) {
        await (navEl as any).push(LoginNotificationPage)
      } else {
        ionRouter.push(FRONTEND_ROUTES.home)
      }
    }
  } catch (e) {
    toast('Couldn\'t save, please try again', { color: 'danger' })
  } finally {
    isSubmitting.value = false
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
</style>