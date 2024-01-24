<template>
  <div class="bg-background w-full h-full absolute z-50">
    <swiper-container class="h-full w-full" :pagination="!keyboardActivated" @init="initSwiper"
                      @slidechange="slideChange">
      <swiper-slide v-if="isNewAccount">
        <div class="w-full h-full absolute bottom-5 flex flex-col justify-center items-center p-2">
          <ion-alert
            :is-open="showAndroidPwaAlert"
            :header="'Install Our App!'"
            :message="'For a better experience, install our app from the Play store.'"
            :buttons="androidPwaButtons"
          />
          <img :src="girlDrawing" class="w-full md:h-[22rem] sm:h-[20rem]" alt="Girl drawing" />
          <h1 class="title">Welcome to SketchMate</h1>
          <p class="subtitle">A simple app that makes sketching and sharing a part of your routine</p>
        </div>
      </swiper-slide>

      <swiper-slide v-if="isNewAccount">
        <div class="w-full h-full absolute bottom-5 flex flex-col justify-center items-center p-2">
          <img :src="matchDrawing" class="w-full md:h-[20rem] sm:h-[16rem] h-[16rem]" alt="Girl drawing" />
          <h1 class="title pt-2">Connect to a mate</h1>
          <p class="subtitle">By scanning their QR code or sharing your personal link</p>
        </div>
      </swiper-slide>
      <swiper-slide v-if="isNewAccount">
        <div class="w-full h-full absolute bottom-8 flex flex-col justify-center items-center p-2">
          <Lottie :json="sketching" class="w-full md:h-[28rem] sm:h-[22rem] h-[22rem]" />
          <h1 class="title -mt-20">Sketch at your own pace</h1>
          <p class="subtitle">Whether it's a few times a day or once in a while</p>
        </div>
      </swiper-slide>
      <swiper-slide v-if="isNewAccount">
        <div class="w-full h-full absolute bottom-5 flex flex-col justify-center items-center p-2">
          <img :src="gallery" class="w-full md:h-[20rem] h-[16rem]" />
          <h1 class="title">Personal gallery</h1>
          <p class="subtitle">Store your sketches in a simple, elegant gallery</p>
        </div>
      </swiper-slide>
      <swiper-slide v-if="isNewAccount">
        <div class="w-full h-full absolute bottom-10 flex flex-col justify-center items-center p-2">
          <img :src="widget" class="h-[350px] aspect-auto mx-auto -mb-10" alt="Gallery drawing" />
          <h1 class="title pt-12">Stay connected</h1>
          <p class="subtitle">View your friend's latest sketch straight from your widget</p>
        </div>
      </swiper-slide>

      <swiper-slide v-if="(!isNative() && installPrompt) || showIosSafariInstructions()">
        <div class="w-full h-full absolute bottom-20 flex flex-col justify-center items-center p-2">
          <img :src="downloadImg" class="w-full h-[460px] -mb-[120px]" alt="Girl drawing" />
          <h1 class="title pt-12">Install SketchMate</h1>
          <p class="subtitle">Install on the play store or install the Web App</p>
          <div class="flex w-full justify-center items-center pt-3">
            <ion-button v-if="showIosSafariInstructions()" color="secondary" id="pwaIOS"
            >Install Sketchmate
            </ion-button>
            <ion-button color="secondary" @click="onInstallPWAClick"
                        v-else-if="!isNative() && installPrompt"
            >Install SketchMate
            </ion-button>
            <IosPwaInstructions trigger="pwaIOS" v-if="showIosSafariInstructions()" />
          </div>
        </div>
      </swiper-slide>

      <swiper-slide>
        <div class="w-full h-full">
          <ion-toolbar color="tertiary">
            <ion-title>{{ isNewAccount ? 'Account Setup' : 'Enable Notifications' }}</ion-title>
          </ion-toolbar>

          <div class="flex flex-col h-4/5" v-if="user">
            <div class="flex-grow flex flex-col justify-center items-center">
              <div class="w-full flex justify-center items-center pt-8" v-if="isNewAccount">
                <ProfilePictureSelector :img="user.img" @update:img="img => uploadImage(img)" />
              </div>

              <div class="w-full justify-center flex pt-8" v-if="isNewAccount">
                <ion-input
                  class="w-1/2 max-w-xs text-black"
                  helperText="Name"
                  type="text"
                  maxlength="30"
                  fill="outline"
                  placeholder="e.g. SketchMater"
                  v-model="name"
                  ref="nameRef"
                  @ionBlur="onNameBlur"
                  @keyup.enter="onEnter"
                  @ionFocus="onFocus"
                  enterkeyhint="done"
                  autocapitalize="sentences"
                ></ion-input>
              </div>

              <img :src="newMessage" class="w-full md:h-[20rem] h-[14rem]" alt="Girl drawing" v-if="!isNewAccount" />

              <div class="p-6 text-gray-500 text-sm mx-auto flex flex-col items-center justify-center">
                <p class="text-lg -ml-12">Enable notifications to:</p>
                <div>
                  <ul class="list-disc list-inside">
                    <li>Receive sketches from your friends</li>
                    <li v-if="isNative()">Get daily reminders</li>
                    <li v-if="isNative()">Use the SketchMate widget</li>
                  </ul>
                </div>
              </div>

              <div class="w-full flex justify-center items-center py-3">
                <ion-icon
                  :icon="svg(deviceNotificationsAllowed ? mdiBellRing : mdiBellOff)"
                  class="w-[28px] h-[28px] pr-3 fill-gray-600"
                />
                <ion-toggle
                  :checked="deviceNotificationsAllowed"
                  @ionChange="handleNotificationChange"
                  mode="ios"
                  :color="'secondary'"
                />
              </div>
            </div>

          </div>
        </div>
      </swiper-slide>

    </swiper-container>

    <div class="w-full flex justify-center items-center absolute bottom-16" v-if="!keyboardActivated">
      <ion-button
        @click="onContinueButtonPress"
        color="secondary"
        fill="outline"
        class="w-6/12 h-10 max-w-md rounded-full z-10"
        mode="ios"
      >{{ lastSlide ? 'Finish' : 'Continue' }}
      </ion-button>
    </div>
  </div>

</template>

<script setup lang="ts">

import girlDrawing from '@/assets/illustrations/girl_drawing.svg'
import { IonAlert, IonButton, IonIcon, IonInput, IonTitle, IonToggle, IonToolbar } from '@ionic/vue'
import { computed, onMounted, ref, watch } from 'vue'
import matchDrawing from '@/assets/illustrations/match.svg'
import newMessage from '@/assets/illustrations/new-messages.svg'
import sketching from '@/assets/lottie/sketching.json'
import gallery from '@/assets/illustrations/gallery.svg'
import widget from '@/assets/illustrations/widget.webp'
import Lottie from '@/components/general/Lottie.vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import { disableNotifications, requestNotifications } from '@/helper/notification.helper'
import { Swiper } from 'swiper/types'
import { register } from 'swiper/element/bundle'
import {
  blurIonInput,
  compressImg, installPWA,
  isMobile,
  isNative,
  setAppColors,
  showIosSafariInstructions,
  svg
} from '@/helper/general.helper'
import { mdiBellOff, mdiBellRing } from '@mdi/js'
import ProfilePictureSelector from '@/components/general/ProfilePictureSelector.vue'
import { useAPI } from '@/service/api/api.service'
import { colorsPerRoute, settingsModalColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { EventBus } from '@/main'
import router from '@/router'
import downloadImg from '@/assets/illustrations/download.svg'
import IosPwaInstructions from '@/components/general/IosPwaInstructions.vue'

register()
const lastSlide = ref(false)

const { showSettingsOnLoginModal, isNewAccount, installPrompt } = storeToRefs(useAppStore())

const { user, deviceFingerprint } = storeToRefs(useAppStore())
const name = ref(user.value!.name)
const nameRef = ref<HTMLIonInputElement>()
const api = useAPI()

watch(isNewAccount, () => {
  setTimeout(() => swiper.value?.update(), 100)
})

const showAndroidPwaAlert = ref(false)
const androidPwaButtons = [
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

const keyboardActivated = ref(false)
const swiper = ref<Swiper>()
const deviceNotificationsAllowed = computed(() => user.value?.subscriptions.some(s => s.fingerprint == deviceFingerprint.value))

onMounted(() => {
  setTimeout(() => setAppColors(settingsModalColorConfig), 300)
  if (isNewAccount.value) router.replace(`/${FRONTEND_ROUTES.connect}`)
})

async function onInstallPWAClick() {
  await installPWA(installPrompt)
  if (!installPrompt.value) nextSlide()
}


function slideChange() {
  if (swiper.value?.activeIndex === swiper.value!.slides.length - 1) {
    lastSlide.value = true
    setTimeout(requestNotifications, 1000)
  } else lastSlide.value = false
}

function onNameBlur() {
  if (isMobile()) setTimeout(() => (keyboardActivated.value = false), 150)
  if (name.value != '') {
    api.changeUserName({
      _id: user.value!._id,
      name: name.value
    })
    user.value!.name = name.value
    EventBus.emit('reset-name')
  } else name.value = user.value!.name
}

function onEnter() {
  blurIonInput(nameRef.value)
}

function onFocus() {
  if (isMobile()) keyboardActivated.value = true
}


async function uploadImage(img: any) {
  const compressedImg = await compressImg(img, { size: 256 })
  const imgUrl = await api.uploadProfileImg({
    _id: user.value!._id,
    img: compressedImg,
    previousImage: user.value?.img?.includes('aku') ? undefined : user.value?.img
  })
  user.value!.img = imgUrl!
}

function handleNotificationChange() {
  deviceNotificationsAllowed.value ? disableNotifications() : requestNotifications()
}

function nextSlide() {
  swiper.value?.slideNext()
}

function initSwiper(e: any) {
  swiper.value = e.detail[0]
}

function onContinueButtonPress() {
  if (swiper.value?.activeIndex === swiper.value!.slides.length - 1) {
    setAppColors(colorsPerRoute[FRONTEND_ROUTES.connect])
    showSettingsOnLoginModal.value = false
  } else nextSlide()
}
</script>

<style scoped>
.title {
  @apply text-2xl text-center font-bold text-black
}

.subtitle {
  @apply text-black text-lg text-center px-4
}

swiper-container {
  --swiper-pagination-color: var(--ion-color-secondary);
}
</style>