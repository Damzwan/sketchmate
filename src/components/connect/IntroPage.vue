<template>
  <ion-page>
    <ion-content>
      <swiper-container class="h-full" pagination="true" @init="initSwiper" @slidechange="slideChange">
        <swiper-slide>
          <div class="container">
            <img :src="girlDrawing" class="w-full h-[230px]" alt="Girl drawing" />
            <h1 class="title pt-12">Welcome to SketchMate</h1>
            <p class="subtitle">A simple app that makes sketching and sharing a part of your everyday routine</p>
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
            <LottieAnimation
              :animation-data="sketching"
              :auto-play="false"
              :loop="false"
              :speed="1"
              class="w-full h-[430px]"
              alt="Girl drawing"
              ref="anim"
            />
            <h1 class="title -mt-10">Sketch at your own pace</h1>
            <p class="subtitle">Whether it's a few times a day or once in a while, no artistic skills required</p>
          </div>
        </swiper-slide>
        <swiper-slide>
          <div class="container">
            <img :src="gallery" class="w-full h-[230px]" alt="Gallery drawing" />
            <h1 class="title pt-12">Personal Gallery</h1>
            <p class="subtitle">Your sketches are stored in a simple, elegant gallery</p>
          </div>
        </swiper-slide>
        <swiper-slide>
          <div class="container">
            <img :src="widget" class="h-[350px] aspect-auto mx-auto" alt="Gallery drawing" />
            <h1 class="title pt-12">Stay Connected</h1>
            <p class="subtitle"> View your friend's latest sketch straight from your widget. </p>
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
              <ion-avatar class="w-32 h-32 relative cursor-pointer" @click="() => imgInput!.click()">
                <img alt="Profile picture" :src="img || stock_img" class="object-fill w-full h-full" />
                <input
                  type="file"
                  ref="imgInput"
                  class="hidden"
                  accept="image/png, image/jpeg"
                  @change="onImageChange"
                />
                <ion-icon :icon="addOutline" class="badge rounded-full" />
              </ion-avatar>
            </div>

            <!-- Name Input -->
            <div class="w-full justify-center flex pt-8">
              <ion-input
                class="w-1/2 max-w-xs"
                helperText="Name"
                type="text"
                fill="outline"
                placeholder="e.g. BiggusDickus"
                v-model="name"
              />
            </div>

            <div class="p-6 text-gray-500 text-sm mx-auto flex flex-col items-center justify-center" v-if="isNative()">
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
            <div class="w-full flex justify-center items-center pt-6" v-if="isNative()">
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

      <div class="w-full flex justify-center items-center absolute bottom-16">
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
  </ion-page>
</template>

<script lang="ts" setup>
import {
  IonAvatar,
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonPage,
  IonTitle,
  IonToggle,
  IonToolbar,
  isPlatform
} from '@ionic/vue'

import { onMounted, ref } from 'vue'
import { useAppStore } from '@/store/app.store'
import { compressImg, isNative, svg } from '@/helper/general.helper'
import { mdiBellOff, mdiBellRing } from '@mdi/js'
import { disableNotifications, requestNotifications } from '@/helper/notification.helper'
import { storeToRefs } from 'pinia'
import { register } from 'swiper/element/bundle'
import { CreateUserParams } from '@/types/server.types'
import girlDrawing from '@/assets/illustrations/girl_drawing.svg'
import matchDrawing from '@/assets/illustrations/match.svg'
import gallery from '@/assets/illustrations/gallery.svg'
import widget from '@/assets/illustrations/widget.webp'
import { LottieAnimation } from 'lottie-web-vue'
import sketching from '@/assets/lottie/sketching.json'
import { Swiper } from 'swiper/types'
import { addOutline } from 'ionicons/icons'

register()

const stock_img = 'https://sketchmate.blob.core.windows.net/account/aku.jpg'

const { createUser } = useAppStore()
const name = ref()

const img = ref()
const imgInput = ref<HTMLInputElement>()

const anim = ref<any>()

const { isLoggedIn, localSubscription, localUserId, localUserImg } = storeToRefs(useAppStore())
const swiper = ref<Swiper>()
const lastSlide = ref(false)

function slideChange() {
  if (swiper.value?.activeIndex === 2) anim.value.play()

  if (swiper.value?.activeIndex === swiper.value!.slides.length - 1) {
    lastSlide.value = true
    requestNotifications()
  } else lastSlide.value = false
}

function initSwiper(e: any) {
  swiper.value = e.detail[0]
}

function nextSlide(e: any) {
  swiper.value?.slideNext()
}

async function setLocalImg() {
  let localImg = stock_img

  if (img.value && imgInput.value?.files) {
    new Promise<void>(resolve => {
      const reader = new FileReader()
      reader.onloadend = function () {
        const dataUrl = reader.result
        localImg = dataUrl!.toString()
        resolve()
      }
      reader.readAsDataURL(imgInput.value!.files![0])
    })
  }
  localUserImg.value = localImg
}

async function create() {
  await setLocalImg()
  localUserId.value = 'ready' // hack to show the connect page
  const data: CreateUserParams = {}

  if (name.value) data.name = name.value
  if (img.value && imgInput.value?.files) {
    data.img = await compressImg(imgInput.value.files[0], { size: 256, returnType: 'file' })
  }
  if (localSubscription.value) data.subscription = localSubscription.value
  createUser(data)
}

const onImageChange = (e: Event) => {
  const target = e.target as HTMLInputElement

  if (target.files && target.files[0]) {
    const reader = new FileReader()

    reader.onload = (e: ProgressEvent<FileReader>) => {
      if (e.target) {
        img.value = e.target.result as string
      }
    }

    reader.readAsDataURL(target.files[0])
  }
}

function handleNotificationChange() {
  if (!lastSlide.value) return // TODO hack
  if (localSubscription.value) {
    disableNotifications()
  } else requestNotifications()
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

.badge {
  background: var(--ion-color-secondary);
  position: absolute;
  right: 12px;
  bottom: 10px;
  z-index: 4;
}
</style>
