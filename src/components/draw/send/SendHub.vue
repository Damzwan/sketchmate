<template>
  <div class="h-full bg-background flex flex-col cabin-sketch-regular top-pad-safe">

    <div class="flex items-center p-4 backdrop-blur-md border-b border-primary/60">
      <button @click="goBack"
              class="w-10 h-10 flex items-center justify-center bg-white/50 border border-primary/40 rounded-full active:scale-95 transition-transform shadow-sm mr-3">
        <ion-icon :icon="svg(mdiChevronLeft)" class="w-7 h-7 text-black" />
      </button>
      <h2 class="text-2xl font-bold text-black pt-1">Share Masterpiece</h2>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-6">

      <div class="bg-primary/20 rounded-3xl p-2 border border-primary/40 shadow-inner">
        <PreviewDrawing
          :newPreview="newPreview"
          :src="preview"
          @crop-completed="(e: any) => crop(e)"
          :aspectRatio="getAspectRatio()"
        />
      </div>

      <div class="space-y-3">
        <h3 class="text-lg font-bold text-secondary px-2 uppercase tracking-widest">Where to?</h3>

        <button @click="goTo(SendMates)"
                class="w-full flex items-center p-4 bg-primary/40 border border-primary/60 rounded-2xl active:scale-[0.98] transition-all shadow-sm hover:bg-primary/50">
          <div
            class="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-secondary mr-4 shadow-sm border border-primary/20">
            <ion-icon :icon="svg(mdiSend)" class="w-6 h-6" />
          </div>
          <div class="text-left flex-1">
            <p class="text-xl font-bold text-black leading-none">Send to Mates</p>
            <p class="text-sm text-black/60 font-bold mt-1">Direct message to friends</p>
          </div>
          <ion-icon :icon="svg(mdiChevronRight)" class="w-6 h-6 text-black/30" />
        </button>

        <button @click="goTo(SendPost)"
                class="w-full flex items-center p-4 bg-primary/40 border border-primary/60 rounded-2xl active:scale-[0.98] transition-all shadow-sm hover:bg-primary/50">
          <div
            class="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-secondary mr-4 shadow-sm border border-primary/20">
            <ion-icon :icon="svg(mdiEarth)" class="w-6 h-6" />
          </div>
          <div class="text-left flex-1">
            <p class="text-xl font-bold text-black leading-none">Create Public Post</p>
            <p class="text-sm text-black/60 font-bold mt-1">Share with the community</p>
          </div>
          <ion-icon :icon="svg(mdiChevronRight)" class="w-6 h-6 text-black/30" />
        </button>

        <button @click="goTo(SendBalloon)"
                class="w-full flex items-center p-4 bg-primary/40 border border-primary/60 rounded-2xl active:scale-[0.98] transition-all shadow-sm hover:bg-primary/50">
          <div
            class="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-secondary mr-4 shadow-sm border border-primary/20">
            <span class="text-2xl">🎈</span>
          </div>
          <div class="text-left flex-1">
            <p class="text-xl font-bold text-black leading-none">Release Balloon</p>
            <p class="text-sm text-black/60 font-bold mt-1">Send it to a random stranger</p>
          </div>
          <ion-icon :icon="svg(mdiChevronRight)" class="w-6 h-6 text-black/30" />
        </button>

      </div>
    </div>

    <div class="p-6 pt-2 pb-8 bg-background">
      <ion-button
        id="confirm-new"
        expand="block"
        shape="round"
        color="secondary"
        class="h-14 shadow-lg text-xl"
      >
        NEW DRAWING
      </ion-button>
    </div>

  </div>

  <ConfirmationAlert
    header="Are you sure?"
    message="This will delete your current drawing and progress."
    @confirm="doneAndReset"
    trigger="confirm-new"
    class="cabin-sketch-regular"
  />
</template>

<script setup lang="ts">
import { IonIcon, IonPage, IonButton } from '@ionic/vue'
import { mdiChevronLeft, mdiChevronRight, mdiSend, mdiEarth } from '@mdi/js'

import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'

import { svg } from '@/helper/general.helper'

// @ts-ignore
import PreviewDrawing from '@/components/draw/PreviewDrawing.vue'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import SendMates from '@/components/draw/send/SendMates.vue'
import SendPost from '@/components/draw/send/SendPost.vue'
import SendBalloon from '@/components/draw/send/SendBalloon.vue'
import { onMounted } from 'vue'

const drawStore = useDrawStore()
const { preview, newPreview } = storeToRefs(drawStore)
const { getAspectRatio, crop, reset } = drawStore

// TODO improve
onMounted(() => {
  const { createPreview } = useDrawStore()
  setTimeout(() => {
    createPreview()
  }, 50)
})

const goBack = (e: Event) => {
  const nav = (e.target as HTMLElement).closest('ion-nav')
  nav?.pop()
}

const goTo = (component: any) => {
  const nav = document.querySelector('ion-nav')
  nav?.push(component)
}

async function doneAndReset() {
  reset()
  const nav = document.querySelector('ion-nav')
  await nav?.popToRoot()
}
</script>

<style scoped>
.cabin-sketch-regular {
  font-family: 'Cabin Sketch', cursive !important;
}

ion-button {
  --border-radius: 9999px;
  font-family: 'Cabin Sketch', cursive !important;
  font-weight: 700;
}
</style>