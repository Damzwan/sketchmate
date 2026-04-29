<template>
  <ion-page>
    <div class="h-full bg-background flex flex-col relative cabin-sketch-regular top-pad-safe">

      <div class="flex items-center p-4  backdrop-blur-md border-b border-primary/60">
        <button @click="goBack"
                class="w-10 h-10 flex items-center justify-center bg-white/50 border border-primary/40 rounded-full active:scale-95 transition-transform shadow-sm mr-3">
          <ion-icon :icon="svg(mdiChevronLeft)" class="w-7 h-7 text-black" />
        </button>
        <h2 class="text-2xl font-bold text-black pt-1">Create Post</h2>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-6 pb-24">

        <div class="bg-primary/20 p-4 rounded-3xl border border-primary/40 flex space-x-4 shadow-sm items-start">
          <div
            class="w-20 h-20 shrink-0 bg-white rounded-xl border border-primary/40 shadow-sm overflow-hidden flex items-center justify-center p-1">
            <img :src="newPreview || preview" class="w-full h-full object-contain" />
          </div>

          <textarea
            v-model="caption"
            placeholder="Write a description..."
            class="flex-1 bg-transparent border-none outline-none resize-none text-black placeholder:text-black/40 font-bold text-lg h-20"
            maxlength="200"
          ></textarea>
        </div>

        <div class="space-y-2">
          <h3 class="text-lg font-bold text-secondary px-2 uppercase tracking-widest">Settings</h3>
          <div class="bg-white/50 border border-primary/40 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div>
              <p class="text-xl font-bold text-black">Allow Comments</p>
              <p class="text-sm text-black/60 font-bold tracking-wide mt-0.5">Let others discuss your art</p>
            </div>
            <ion-toggle v-model="allowComments" style="--background-checked: var(--ion-color-secondary)"></ion-toggle>
          </div>
        </div>

      </div>

      <div class="absolute bottom-8 left-0 right-0 px-6 pointer-events-none">
        <ion-button
          expand="block"
          shape="round"
          color="secondary"
          class="pointer-events-auto h-14 shadow-xl text-2xl"
          @click="onPostClick"
          :disabled="isLoading"
        >
          <span v-if="!isLoading">Publish to Community</span>
          <ion-spinner v-else name="crescent" class="text-white"></ion-spinner>
        </ion-button>
      </div>

    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { IonPage, IonIcon, IonSpinner, IonToggle, IonButton } from '@ionic/vue'
import { mdiChevronLeft } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/draw/store/draw.store'

const drawStore = useDrawStore()
const { preview, newPreview } = storeToRefs(drawStore)
const { getDataToSend } = drawStore

const caption = ref('')
const allowComments = ref(true)
const isLoading = ref(false)

const goBack = (e: Event) => {
  const nav = (e.target as HTMLElement).closest('ion-nav')
  nav?.pop()
}

async function onPostClick() {
  isLoading.value = true

  try {
    const processedData = await getDataToSend()

    // Example: await postService.createPost(processedData, caption.value, allowComments.value)
    console.log('Posting drawing...', caption.value)

    // Non-destructive: Pop back to Hub
    const nav = document.querySelector('ion-nav')
    await nav?.pop()
  } catch (error) {
    console.error('Failed to create post:', error)
  } finally {
    isLoading.value = false
  }
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