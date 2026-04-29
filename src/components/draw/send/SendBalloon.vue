<template>
  <ion-page>
    <div class="h-full bg-background flex flex-col relative cabin-sketch-regular top-pad-safe">

      <div class="flex items-center p-4 backdrop-blur-md border-b border-primary/60">
        <button @click="goBack"
                class="w-10 h-10 flex items-center justify-center bg-white/50 border border-primary/40 rounded-full active:scale-95 transition-transform shadow-sm mr-3">
          <ion-icon :icon="svg(mdiChevronLeft)" class="w-7 h-7 text-black" />
        </button>
        <h2 class="text-2xl font-bold text-black pt-1">Release Balloon</h2>
      </div>

      <div class="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center space-y-8 pb-32">

        <div class="relative w-40 h-40 flex items-center justify-center animate-[float_3s_ease-in-out_infinite]">
          <div class="text-[80px] z-10 drop-shadow-md">🎈</div>
          <div
            class="absolute -bottom-2 -right-4 w-16 h-16 bg-white rounded-lg border-2 border-primary/60 shadow-lg p-1 z-20 rotate-12">
            <img :src="newPreview || preview" class="w-full h-full object-contain" />
          </div>
        </div>

        <div class="text-center px-6">
          <h3 class="text-2xl font-bold text-black mb-2">Let it fly!</h3>
          <p class="text-lg text-black/60 font-bold leading-tight">
            Attach your drawing to a balloon and send it into the sky. A random stranger online will catch it and can
            start sketching with you.
          </p>
        </div>

        <div class="w-full bg-white/50 p-1.5 rounded-2xl border border-primary/40 shadow-sm max-w-sm mx-auto">
          <input
            v-model="note"
            type="text"
            placeholder="Attach a short note... (optional)"
            maxlength="40"
            class="w-full bg-transparent px-4 py-3 border-none outline-none text-xl text-black placeholder:text-black/40 font-bold text-center"
          />
        </div>

      </div>

      <div class="absolute bottom-8 left-0 right-0 px-6 pointer-events-none">
        <ion-button
          expand="block"
          shape="round"
          color="secondary"
          class="pointer-events-auto h-14 shadow-xl text-2xl"
          @click="onReleaseClick"
          :disabled="isLoading"
        >
          <span v-if="!isLoading">Release into the wild</span>
          <ion-spinner v-else name="crescent" class="text-white"></ion-spinner>
        </ion-button>
      </div>

    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IonPage, IonIcon, IonSpinner, IonButton } from '@ionic/vue'
import { mdiChevronLeft } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'
import { useToast } from '@/service/toast.service'

const drawStore = useDrawStore()
const { preview, newPreview } = storeToRefs(drawStore)
const { getDataToSend, createBalloon } = drawStore

const note = ref('')
const isLoading = ref(false)

const goBack = (e: Event) => {
  const nav = (e.target as HTMLElement).closest('ion-nav')
  nav?.pop()
}

async function onReleaseClick() {
  isLoading.value = true

  try {
    const processedData = await getDataToSend()
    const nav = document.querySelector('ion-nav')
    await nav?.pop()

    await createBalloon(note.value, {
      img: processedData.img,
      aspect_ratio: processedData.aspect_ratio,
      canvas: processedData.canvas
    })

    const { toast } = useToast()
    toast('Sent balloon in the air, a stranger will catch it')
  } catch (error) {
    console.error('Failed to release balloon:', error)
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
@keyframes float {
  0% {
    transform: translateY(0px) rotate(0deg);
  }
  50% {
    transform: translateY(-10px) rotate(2deg);
  }
  100% {
    transform: translateY(0px) rotate(0deg);
  }
}

.animate-\[float_3s_ease-in-out_infinite\] {
  animation: float 3s ease-in-out infinite;
}

.cabin-sketch-regular {
  font-family: 'Cabin Sketch', cursive !important;
}

ion-button {
  --border-radius: 9999px;
  font-family: 'Cabin Sketch', cursive !important;
  font-weight: 700;
}
</style>