<template>
  <div class="flex justify-center items-center">
    <!-- Thumbnail -->
    <div class="relative" v-if="props.src">
      <img

        :src="props.src"
        @click="openModal"
        class="max-w-44 max-h-44 object-contain rounded-lg cursor-pointer shadow"
      />


      <button
        @click="openModal"
        class="absolute bottom-1 right-1 bg-black/60 text-white rounded-full p-1 flex items-center justify-center cursor-pointer"
      >
        <IonIcon :icon="svg(mdiFullscreen)" class="w-4 h-4" />
      </button>
    </div>
    <div v-else class="w-44 h-44 rounded-lg shadow">
      <ion-skeleton-text :animated="true" class="w-full h-full" />
    </div>

    <!-- Fullscreen Modal -->
    <IonModal :is-open="isOpen" @didDismiss="closeModal">
      <ion-header>
        <ion-toolbar class="bg-black" color="black">
          <ion-button fill="clear" class="text-white" @click="closeModal" slot="end">
            <IonIcon :icon="svg(mdiClose)" class="w-5 h-5" />
          </ion-button>
        </ion-toolbar>
      </ion-header>
      <div class="w-full h-full bg-black flex items-center justify-center p-4 relative" @click="closeModal">
        <img
          :src="src"
          class="max-h-full max-w-full object-contain"
        />
      </div>
    </IonModal>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { IonHeader, IonIcon, IonModal, IonSkeletonText, IonToolbar } from '@ionic/vue'

// MDI icons
import { mdiClose, mdiFullscreen } from '@mdi/js'
import { svg } from '@/helper/general.helper.ts'

const props = defineProps({
  src: {
    type: String,
    required: false,
    default: null
  }
})


const isOpen = ref(false)


const openModal = () => (isOpen.value = true)
const closeModal = () => (isOpen.value = false)
</script>
