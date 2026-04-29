<template>
  <ion-page>
    <div class="h-full bg-background flex flex-col relative top-pad-safe">

      <div class="flex items-center p-4 backdrop-blur-md border-b border-primary/60">
        <button @click="goBack"
                class="w-10 h-10 flex items-center justify-center bg-white/50 border border-primary/40 rounded-full active:scale-95 transition-transform shadow-sm mr-3">
          <ion-icon :icon="svg(mdiChevronLeft)" class="w-7 h-7 text-black" />
        </button>
        <h2 class="text-xl font-bold text-black cabin-sketch-regular pt-1">
          Send to gallery
        </h2>
      </div>

      <div class="flex-1 overflow-y-auto p-4 space-y-2 pb-28" v-if="user">

        <div
          class="w-full flex items-center p-3 border border-secondary bg-secondary/10 rounded-2xl shadow-sm"
        >
          <img :src="user.img" class="w-10 h-10 rounded-full mr-3 border-2 border-white object-cover shadow-sm" />
          <div class="flex-1 text-left">
            <p class="text-sm font-bold text-black">{{ user.name }} (You)</p>
          </div>

          <div class="w-6 h-6 rounded-full bg-secondary flex items-center justify-center shadow-sm">
            <ion-icon :icon="svg(mdiCheck)" class="w-4 h-4 text-white" />
          </div>
        </div>

        <div class="py-2 flex items-center px-4">
          <div class="flex-1 h-[1px] bg-primary-shade/30"></div>
          <span class="px-3 text-[10px] font-black uppercase tracking-widest text-black/30">Select Mates</span>
          <div class="flex-1 h-[1px] bg-primary-shade/30"></div>
        </div>

        <button
          v-for="mate in user.mates"
          :key="mate._id"
          @click="toggle(mate._id)"
          class="w-full flex items-center p-3 border rounded-2xl active:scale-[0.98] transition-all"
          :class="selected.has(mate._id) ? 'bg-secondary/10 border-secondary shadow-sm' : 'bg-white/50 border-primary/40'"
        >
          <img :src="mate.img" class="w-10 h-10 rounded-full mr-3 border-2 border-white object-cover shadow-sm" />
          <p class="text-sm font-bold text-black flex-1 text-left">{{ mate.name }}</p>

          <div
            class="w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors"
            :class="selected.has(mate._id) ? 'bg-secondary border-secondary' : 'border-primary/60 bg-transparent'"
          >
            <ion-icon v-if="selected.has(mate._id)" :icon="svg(mdiCheck)" class="w-4 h-4 text-white" />
          </div>
        </button>

      </div>

      <div class="absolute bottom-8 left-0 right-0 px-6 pointer-events-none">
        <ion-button
          expand="block"
          shape="round"
          color="secondary"
          class="pointer-events-auto h-14 "
          @click="onSendClick"
          :disabled="isLoading"
        >
          <span v-if="!isLoading" class="text-lg cabin-sketch-regular">{{ buttonText }}</span>
          <ion-spinner v-else name="crescent"></ion-spinner>
        </ion-button>
      </div>

    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { IonPage, IonIcon, IonSpinner, IonButton } from '@ionic/vue'
import { mdiChevronLeft, mdiCheck } from '@mdi/js'
import { storeToRefs } from 'pinia'
import { svg } from '@/helper/general.helper'
import { useAuthStore } from '@/store/auth.store'
import { useDrawStore } from '@/draw/store/draw.store'
import { useMateSelection } from '@/draw/services/useMateSelection'


const { user } = storeToRefs(useAuthStore())
const drawStore = useDrawStore()
const { isSendingDrawing } = storeToRefs(drawStore)
const { send, getDataToSend } = drawStore

const { selected, toggle, count, reset } = useMateSelection()
const isLoading = ref(false)

// Logic: Auto-select user on mount if not already selected
onMounted(() => {
  if (user.value && !selected.value.has(user.value._id)) {
    toggle(user.value._id)
  }
})

const buttonText = computed(() => {
  const isMeSelected = user.value && selected.value.has(user.value._id)
  const othersCount = isMeSelected ? count.value - 1 : count.value

  if (othersCount === 0) return 'Save to My Sketches'
  return `Send (${othersCount})`
})

const goBack = (e: Event) => {
  const nav = (e.target as HTMLElement).closest('ion-nav')
  nav?.pop()
}

async function onSendClick() {
  isLoading.value = true
  isSendingDrawing.value = true

  try {
    const nav = document.querySelector('ion-nav')
    nav?.pop()

    const processedData = await getDataToSend()
    const sendCopy = Array.from(selected.value)

    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 300)))

    await send(sendCopy, processedData)
    reset()
  } catch (error) {
    console.error('Sketch send failed:', error)
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
/* Ensure the ion-button text stays thick and legible */
ion-button {
  --border-radius: 9999px;
  font-weight: 900;
}
</style>