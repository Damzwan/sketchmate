<template>
  <ion-content>
    <swiper-container class="h-full" :pagination="!keyboardActivated" @init="initSwiper" @slidechange="slideChange">
      <swiper-slide>
        <div class="container">
          <ion-alert
            :is-open="showAlert"
            :header="'Install Our App!'"
            :message="'For a better experience, install our app from the Play store.'"
            :buttons="alertButtons"
          />
          <img :src="girlDrawing" class="w-full h-[230px]" alt="Girl drawing" />
          <h1 class="title pt-12">Welcome to SketchMate</h1>
          <p class="subtitle">A simple app that makes sketching and sharing a part of your routine</p>
        </div>
      </swiper-slide>

      <swiper-slide>
        <div class="container">
          <img :src="matchDrawing" class="w-full h-[230px]" alt="Girl drawing" />
          <h1 class="title pt-12">Connect to a mate</h1>
          <p class="subtitle">By scanning their QR code or sharing your personal link</p>
        </div>
      </swiper-slide>
      <swiper-slide>
        <div class="container">
          <Lottie :json="sketching" :play="playLottie" class="w-full h-[430px]" />
          <h1 class="title -mt-10">Sketch at your own pace</h1>
          <p class="subtitle">Whether it's a few times a day or once in a while</p>
        </div>
      </swiper-slide>
      <swiper-slide>
        <div class="container">
          <img :src="gallery" class="w-full h-[230px]" alt="Gallery drawing" />
          <h1 class="title pt-12">Personal gallery</h1>
          <p class="subtitle">Store your sketches in a simple, elegant gallery</p>
        </div>
      </swiper-slide>
      <swiper-slide>
        <div class="container">
          <img :src="widget" class="h-[350px] aspect-auto mx-auto -mb-10" alt="Gallery drawing" />
          <h1 class="title pt-12">Stay connected</h1>
          <p class="subtitle">View your friend's latest sketch straight from your widget</p>
        </div>
      </swiper-slide>

      <swiper-slide v-if="(!isNative() && installPrompt) || showIosSafariInstructions()">
        <div class="container">
          <img :src="download" class="w-full h-[460px] -mb-[120px]" alt="Girl drawing" />
          <h1 class="title pt-12">Install SketchMate</h1>
          <p class="subtitle">Install on the play store or install the Web App</p>
          <div class="flex w-full justify-center items-center pt-3 absolute">
            <ion-button color="secondary" @click="installPWA" v-if="!isNative() && installPrompt"
              >Install SketchMate
            </ion-button>
            <ion-button v-if="showIosSafariInstructions()" color="secondary" id="pwaIOS"
              >Install Sketchmate
            </ion-button>
            <IosPwaInstructions trigger="pwaIOS" v-if="showIosSafariInstructions()" />
          </div>
        </div>
      </swiper-slide>

      <swiper-slide>
        <ion-header class="ion-no-border">
          <ion-toolbar color="tertiary">
            <ion-title>Create your profile</ion-title>
          </ion-toolbar>
        </ion-header>

        <!-- Input Fields -->
        <div class="flex-1">
          <!-- Avatar -->
          <div class="w-full flex justify-center items-center pt-8">
            <ProfilePicture v-model:img="img" />
          </div>

          <!-- Name Input -->
          <div class="w-full justify-center flex pt-8">
            <ion-input
              class="w-1/2 max-w-xs"
              helperText="Name"
              type="text"
              fill="outline"
              placeholder="e.g. SketchMater"
              v-model="name"
              enterkeyhint="done"
              ref="nameRef"
              autocapitalize="sentences"
              @keyup.enter="() => blurIonInput(nameRef)"
              @ionFocus="onFocus"
              @ionBlur="onBlur"
            />
          </div>

          <div class="p-6 text-gray-500 text-sm mx-auto flex flex-col items-center justify-center">
            <p class="text-lg -ml-12">Enable notifications to:</p>
            <div>
              <ul class="list-disc list-inside">
                <li>Receive sketches from your mate</li>
                <li>Get daily reminders</li>
                <li>Use the SketchMate widget</li>
              </ul>
            </div>
          </div>

          <!-- Toggle Button -->
          <div class="w-full flex justify-center items-center pt-6">
            <ion-icon
              :icon="svg(localSubscription ? mdiBellRing : mdiBellOff)"
              class="w-[28px] h-[28px] pr-3 fill-gray-600"
            />
            <ion-toggle
              @ionChange="handleNotificationChange"
              mode="ios"
              :color="'secondary'"
              :checked="!!localSubscription"
            />
          </div>
        </div>

        <!-- Submit Button -->
      </swiper-slide>
    </swiper-container>

    <div class="w-full flex justify-center items-center absolute bottom-16" v-if="!keyboardActivated">
      <ion-button
        v-if="lastSlide"
        @click="create"
        color="secondary"
        class="w-6/12 h-10 max-w-md rounded-full z-10"
        mode="ios"
        >Start Sketching
      </ion-button>
      <ion-button
        v-else
        @click="nextSlide"
        color="secondary"
        fill="outline"
        class="w-6/12 h-10 max-w-md rounded-full z-10"
        mode="ios"
        >Continue
      </ion-button>
    </div>
  </ion-content>
</template>

<script lang="ts" setup>
import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonTitle,
  IonToggle,
  IonToolbar,
  IonAlert,
  isPlatform
} from '@ionic/vue'

import { onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/store/app.store'
import {
  blurIonInput,
  compressImg,
  getRandomStockAvatar,
  isMobile,
  isNative,
  showIosSafariInstructions,
  svg
} from '@/helper/general.helper'
import { mdiBellOff, mdiBellRing } from '@mdi/js'
import { disableNotifications, requestNotifications } from '@/helper/notification.helper'
import { storeToRefs } from 'pinia'
import { register } from 'swiper/element/bundle'
import { CreateUserParams } from '@/types/server.types'
import girlDrawing from '@/assets/illustrations/girl_drawing.svg'
import matchDrawing from '@/assets/illustrations/match.svg'
import gallery from '@/assets/illustrations/gallery.svg'
import widget from '@/assets/illustrations/widget.webp'
import download from '@/assets/illustrations/download.svg'
import sketching from '@/assets/lottie/sketching.json'
import { Swiper } from 'swiper/types'
import Lottie from '@/components/general/Lottie.vue'
import ProfilePicture from '@/components/general/ProfilePictureSelector.vue'
import IosPwaInstructions from '@/components/general/IosPwaInstructions.vue'

register()

const alertButtons = [
  {
    text: 'Not Now',
    role: 'cancel',
    cssClass: 'alert-button-cancel'
  },
  {
    text: 'Go to Store',
    handler: () => {
      window.location.href = 'https://play.google.com/store/apps/details?id=ninja.sketchmate.app'
    },
    cssClass: 'alert-button-confirm'
  }
]

const showAlert = ref(false)
onMounted(() => {
  if (isNative() || !isPlatform('android')) return
  const isAndroid = /Android/i.test(navigator.userAgent)
  if (isAndroid) showAlert.value = true
})

const { createUser } = useAppStore()
const name = ref()

const img = ref(getRandomStockAvatar())
const nameRef = ref<any>()

const playLottie = ref(false)

const { localSubscription, localUserId, localUserImg } = storeToRefs(useAppStore())
const swiper = ref<Swiper>()
const lastSlide = ref(false)

const keyboardActivated = ref(false)
const { installPrompt } = storeToRefs(useAppStore())

function slideChange() {
  playLottie.value = swiper.value?.activeIndex === 2

  if (swiper.value?.activeIndex === swiper.value!.slides.length - 1) {
    lastSlide.value = true
    requestNotifications()
  } else lastSlide.value = false
}

function initSwiper(e: any) {
  swiper.value = e.detail[0]
}

function nextSlide() {
  swiper.value?.slideNext()
}

// update the swiper in case we add the new slide
watch(installPrompt, () => {
  if (installPrompt.value) setTimeout(() => swiper.value?.update(), 1)
})

async function create() {
  localUserImg.value = img.value
  localUserId.value = 'ready' // hack to show the connect page
  const data: CreateUserParams = {}

  if (name.value) data.name = name.value
  if (img.value && !img.value.includes('stock')) {
    data.img = await compressImg(img.value, { size: 256, returnType: 'file' })
  } else data.img = img.value
  if (localSubscription.value) data.subscription = localSubscription.value
  await createUser(data)
}

function handleNotificationChange() {
  if (!lastSlide.value) return // TODO hack
  if (localSubscription.value) {
    disableNotifications()
  } else requestNotifications()
}

function onFocus() {
  if (isMobile()) keyboardActivated.value = true
}

function onBlur() {
  if (isMobile()) setTimeout(() => (keyboardActivated.value = false), 150)
}

// TODO duplicate
async function installPWA() {
  if (installPrompt.value) {
    installPrompt.value.prompt()
    const { outcome } = await installPrompt.value.userChoice
    if (outcome === 'accepted') {
      installPrompt.value = null
    }
  }
}
</script>

<style scoped>
.title {
  @apply text-center text-2xl font-bold;
}

.subtitle {
  @apply text-center pt-1 text-base px-10;
}

swiper-container {
  --swiper-pagination-color: var(--ion-color-secondary);
}

.container {
  @apply absolute bottom-[30%] w-full max-w-full;
}

ion-alert {
  --background: var(--ion-color-tertiary);
}
</style>

<style>
button.alert-button.alert-button-confirm {
  color: var(--ion-color-secondary);
}

button.alert-button.alert-button-cancel {
  color: var(--ion-color-secondary);
}
</style>
