<template>
  <div class="h-full bg-background flex flex-col relative top-pad-safe cabin-sketch-regular">

    <div class="flex items-center px-4 py-2 backdrop-blur-md border-primary/60 z-10">
      <button @click="goBack"
              class="w-10 h-10 flex items-center justify-center bg-white/50 border border-primary/40 rounded-full active:scale-95 transition-transform shadow-sm mr-3">
        <ion-icon :icon="svg(mdiChevronLeft)" class="w-7 h-7 text-black" />
      </button>
      <h2 class="text-2xl cabin-sketch-regular font-bold text-black pt-1">Share</h2>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-4 pb-32">
      <div
        class="bg-primary/20 rounded-3xl p-2 border border-primary/40 shadow-inner max-w-[200px] mx-auto animate-fade-in">
        <PreviewDrawing
          :newPreview="newPreview"
          :src="preview"
          @crop-completed="(e: any) => crop(e)"
          :aspectRatio="getAspectRatio()"
        />
      </div>

      <section class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all"
               :class="{'ring-2 ring-secondary/50': isSaveAndSend}">
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <p class="text-xl font-bold text-black leading-none">Save & Send Direct</p>
            <p class="text-sm text-black/60 font-bold mt-1">Keep in gallery and share with mates.</p>
          </div>
          <ion-toggle v-model="isSaveAndSend" color="secondary"></ion-toggle>
        </div>

        <div v-if="isSaveAndSend && user && user.mates && user.mates.length > 0"
             class="pt-1 mt-1 border-t border-primary/20 animate-fade-in">
          <div class="flex overflow-x-auto space-x-3 pb-1 pt-1 hide-scrollbar px-1">
            <button
              v-for="mate in user.mates"
              :key="mate._id"
              @click="toggle(mate._id)"
              class="relative w-[64px] h-[64px] shrink-0 rounded-2xl border-2 transition-all flex flex-col items-center justify-center"
              :class="selected.has(mate._id) ? 'border-secondary shadow-md scale-105 bg-secondary/20' : 'border-transparent bg-primary/60'"
            >
              <img :src="mate.img" class="w-8 h-8 rounded-full object-cover border-2 border-white mb-1 shadow-sm" />
              <div v-if="selected.has(mate._id)"
                   class="absolute -top-1.5 -right-1.5 bg-secondary rounded-full w-6 h-6 flex items-center justify-center border-2 border-white shadow-sm z-10">
                <ion-icon :icon="svg(mdiCheck)" class="text-white w-4 h-4" />
              </div>
              <span class="text-[10px] font-black truncate w-full text-center px-1 text-black">{{ mate.name }}</span>
            </button>
          </div>
        </div>
      </section>

      <section class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all"
               :class="{'ring-2 ring-secondary/50': isPublicPost}">
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <p class="text-xl font-bold text-black leading-none">Community Post</p>
            <p class="text-sm text-black/60 font-bold mt-1">Publish to the public feed.</p>
          </div>
          <ion-toggle v-model="isPublicPost" color="secondary"></ion-toggle>
        </div>

        <div v-if="isPublicPost" class="pt-4 mt-3 border-t border-primary/20 animate-fade-in">
            <textarea
              v-model="postCaption"
              placeholder="Write a caption... (optional)"
              class="w-full bg-primary/10 border border-primary/30 rounded-xl p-3 resize-none outline-none font-bold text-black placeholder:text-black/40 h-20"
              maxlength="200"
            ></textarea>
        </div>
      </section>

      <section class="bg-white/60 border border-primary/40 rounded-3xl p-4 shadow-sm transition-all"
               :class="{'ring-2 ring-secondary/50': isBalloon}">
        <div class="flex items-center justify-between">
          <div class="flex-1 pr-4">
            <p class="text-xl font-bold text-black leading-none"><span class="mr-1">🎈</span> Release Balloon</p>
            <p class="text-sm text-black/60 font-bold mt-1">Send to a random stranger.</p>
          </div>
          <ion-toggle v-model="isBalloon" color="secondary"></ion-toggle>
        </div>

        <div v-if="isBalloon" class="pt-4 mt-3 border-t border-primary/20 animate-fade-in">
          <input
            v-model="balloonNote"
            type="text"
            placeholder="Attach a short note... (optional)"
            maxlength="40"
            class="w-full bg-primary/10 border border-primary/30 rounded-xl p-3 outline-none font-bold text-black placeholder:text-black/40"
          />
        </div>
      </section>

    </div>

    <div class="absolute bottom-6 left-0 right-0 px-6 pointer-events-none z-20">
      <ion-button
        expand="block"
        shape="round"
        color="secondary"
        class="pointer-events-auto h-14 shadow-xl text-2xl"
        @click="executeShares"
        :disabled="isLoading || noActionSelected"
      >
        <span v-if="!isLoading">Send</span>
        <ion-spinner v-else name="crescent" class="text-white"></ion-spinner>
      </ion-button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { IonPage, IonIcon, IonSpinner, IonToggle, IonButton, onIonViewDidEnter } from '@ionic/vue'
import { mdiChevronLeft, mdiCheck } from '@mdi/js'
import { storeToRefs } from 'pinia'
import { compressImg, svg } from '@/helper/general.helper'

import { useAuthStore } from '@/store/auth.store'
import { useDrawStore } from '@/draw/store/draw.store'
import { useMateSelection } from '@/draw/services/useMateSelection'
import { useToast } from '@/service/toast.service'

// @ts-ignore
import PreviewDrawing from '@/components/draw/PreviewDrawing.vue'
import { useDrawLoadStore } from '@/draw/store/drawLoad.store'
import { createPost } from '@/service/api/post.api'

const { user } = storeToRefs(useAuthStore())
const drawStore = useDrawStore()
const { preview, newPreview, isSendingDrawing } = storeToRefs(drawStore)
const { send, getDataToSend, createBalloon, getAspectRatio, crop, createPreview, resetPreview } = drawStore

const { selected, toggle, count, reset: resetMates } = useMateSelection()
const { toast } = useToast()

// UI State
const isSaveAndSend = ref(true) // Defaults to true so they save their work
const isPublicPost = ref(false)
const postCaption = ref('')
const isBalloon = ref(false)
const balloonNote = ref('')
const isLoading = ref(false)


onMounted(() => {
  setTimeout(() => {
    createPreview()
  }, 50)
})

onUnmounted(() => {
  resetPreview()
})

// Validation: At least one main toggle must be active
const noActionSelected = computed(() => {
  return !isSaveAndSend.value && !isPublicPost.value && !isBalloon.value
})

const goBack = (e: Event) => {
  const nav = (e.target as HTMLElement).closest('ion-nav')
  nav?.pop()
}

async function preparePostData(data: {
  canvas: ArrayBuffer | string;
  img: ArrayBuffer | Blob;
}) {
  const jsonString = JSON.stringify(data.canvas)

  const drawingStream = new Blob([jsonString])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))

  const drawingBlob = await new Response(drawingStream).blob()

  // 2. Process Main Image
  const imageBlob = data.img instanceof Blob
    ? data.img
    : new Blob([data.img], { type: 'image/webp' })

  // 3. Generate Thumbnail via your existing compressImg helper
  const thumbnailBlob = await compressImg(imageBlob, {
    size: 500,
    quality: 0.7,
    returnType: 'blob'
  })

  return {
    drawingBlob,
    imageBlob,
    thumbnailBlob
  }
}

async function executeShares() {
  isLoading.value = true
  isSendingDrawing.value = true

  try {
    const processedData = await getDataToSend()
    const { reset } = useDrawStore()
    reset()

    const nav = document.querySelector('ion-nav')
    await nav?.popToRoot()

    const actions = []

    // 1. Queue Direct Messages & Gallery Save
    if (isSaveAndSend.value && user.value) {
      // Start with the mates they selected (if any)
      const directRecipients = Array.from(selected.value)

      // Always push the user's ID so it saves to their personal gallery
      directRecipients.push(user.value._id)

      actions.push(send(directRecipients, processedData))
    }

    if (isPublicPost.value) {
      const { drawingBlob, imageBlob, thumbnailBlob } = await preparePostData({
        canvas: processedData.canvas,
        img: processedData.img
      })

      actions.push(createPost({
        drawingBlob,
        imageBlob,
        thumbnailBlob,
        aspect_ratio: processedData.aspect_ratio || 1,
        description: postCaption.value
      }).then(() => {
        const {toast} = useToast()
        toast("Post created")
      }))
    }

    // 3. Queue Balloon
    if (isBalloon.value) {
      actions.push(createBalloon(balloonNote.value, {
        img: processedData.img,
        aspect_ratio: processedData.aspect_ratio,
        canvas: processedData.canvas
      }))
    }

    // Fire all selected actions concurrently
    await Promise.all(actions)


    const loadStore = useDrawLoadStore()
    void loadStore.removeDraft()

    resetMates()
  } catch (error) {
    console.error('Failed to share masterpiece:', error)
    toast('Something went wrong. Please try again.')
  } finally {
    isLoading.value = false
    isSendingDrawing.value = false
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

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>