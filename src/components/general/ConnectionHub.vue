<template>
  <ion-modal
    :is-open="connectionMenuOpen"
    @did-dismiss="onDismiss"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-connection-modal"
  >
    <div
      class="h-full flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular transition-all duration-300 overflow-y-auto hide-scrollbar">

      <!-- MAIN VIEW: My Code, Search & Scan Trigger -->
      <div v-show="!isScanning" class="space-y-6 animate-fade-in pt-2 mb-4">
        <div class="text-center">
          <h1 class="text-3xl text-secondary font-black tracking-tighter italic leading-none">
            Add a Mate
          </h1>
          <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-2">
            Grow Your Network
          </p>
        </div>

        <!-- Unified Identity Card (With Truncation Fix) -->
        <div
          class="bg-white/60 border border-white p-5 rounded-[2.5rem] flex items-center justify-between shadow-sm relative mt-4 backdrop-blur-md">
          <div class="flex flex-col z-10 w-full pr-4 min-w-0">
            <span class="text-[10px] font-black text-black/40 uppercase tracking-widest mb-2">
              Your Personal Code
            </span>

            <div class="flex items-center gap-3 mb-3 min-w-0">
              <ion-avatar class="w-12 h-12 border-2 border-white shadow-sm overflow-hidden bg-white shrink-0">
                <img :src="user?.img" class="object-cover w-full h-full" />
              </ion-avatar>
              <h2 class="text-2xl text-black font-black leading-none truncate min-w-0">
                {{ user?.name }}
              </h2>
            </div>

            <ion-button
              fill="clear"
              class="ion-no-margin h-10 w-max text-secondary -ml-2 font-black uppercase tracking-widest text-sm"
              @click="() => shareUrl(qrURL)"
            >
              <ion-icon slot="start" :icon="svg(mdiShareVariant)" class="text-xl" />
              Share Link
            </ion-button>
          </div>

          <div class="p-2.5 bg-white rounded-[1.5rem] ring-1 ring-black/5 shadow-inner shrink-0">
            <qrcode-vue :value="qrURL" :size="90" background="white" foreground="#000" />
          </div>
        </div>

        <!-- SEARCH SECTION: Integrated for findability -->
        <section class="space-y-3">
          <p class="text-[10px] font-black text-black/40 uppercase tracking-widest px-2">
            Search by name
          </p>
          <div class="relative">
            <input
              v-model="mateName"
              @keyup.enter="searchUsers"
              placeholder="Artist name..."
              class="w-full bg-white/50 border border-white rounded-2xl px-5 py-4 text-lg font-black text-black shadow-inner focus:outline-none focus:ring-2 focus:ring-secondary/50 transition-all"
            />
            <div class="absolute right-2 top-1/2 -translate-y-1/2">
              <ion-button fill="clear" color="secondary" @click="searchUsers" :disabled="!mateName">
                <ion-spinner v-if="isSearchingUsers" name="bubbles" size="small" />
                <ion-icon v-else slot="icon-only" :icon="svg(mdiSend)" />
              </ion-button>
            </div>
          </div>

          <!-- Search Results -->
          <div v-if="foundMates.length > 0 || isSearchingUsers" class="bg-white/30 rounded-[2rem] border border-white/50 overflow-hidden animate-fade-in">
            <ion-list lines="none" class="bg-transparent p-2">
              <ion-item
                v-for="mate in foundMates"
                :key="mate._id"
                class="rounded-2xl mb-1 bg-white/40"
                @click="inspect(mate._id)"
              >
                <ion-avatar slot="start" class="w-10 h-10">
                  <img :src="mate.img" />
                </ion-avatar>
                <ion-label>
                  <h2 class="font-black text-black">{{ mate.name }}</h2>
                </ion-label>
                <ion-icon slot="end" :icon="svg(mdiChevronRight)" class="opacity-30" />
              </ion-item>
            </ion-list>
          </div>
        </section>

        <!-- OR Divider -->
        <div class="flex items-center justify-center space-x-4 opacity-30 my-4">
          <div class="h-px bg-black flex-1 rounded-full"></div>
          <span class="text-[10px] font-black uppercase tracking-widest">OR</span>
          <div class="h-px bg-black flex-1 rounded-full"></div>
        </div>

        <!-- Big Scan Action -->
        <ion-button
          @click="startCameraView"
          color="secondary"
          shape="round"
          size="large"
          expand="block"
          class="h-16 font-black uppercase tracking-widest"
        >
          <ion-icon slot="start" :icon="svg(mdiQrcodeScan)" class="text-2xl mr-2" />
          Scan a Mate
        </ion-button>
      </div>

      <!-- SCANNER VIEW -->
      <div v-show="isScanning" class="flex flex-col h-full animate-fade-in pt-2 pb-6">
        <div class="flex items-center justify-between mb-4 px-2">
          <ion-button fill="clear" color="dark" class="ion-no-margin -ml-3" @click="stopCameraView">
            <ion-icon slot="icon-only" :icon="arrowBack" class="text-2xl" />
          </ion-button>
          <h2 class="text-xl font-black italic">Camera</h2>
          <div class="w-12"></div>
        </div>

        <div
          class="flex-1 w-full bg-primary/10 rounded-[2.5rem] border border-primary/20 overflow-hidden relative shadow-inner">
          <div v-if="!isNative()" class="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div class="w-48 h-48 border-2 border-dashed border-secondary/60 rounded-3xl"></div>
          </div>
          <video ref="video" class="w-full h-full object-cover bg-black/5" />
          <div class="absolute bottom-6 left-0 right-0 text-center z-10">
            <span
              class="bg-black/60 text-white text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest backdrop-blur-md shadow-sm">
              Point at a Code
            </span>
          </div>
        </div>
      </div>

    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { IonModal, IonButton, IonIcon, IonAvatar, IonList, IonItem, IonLabel, IonSpinner, modalController } from '@ionic/vue'
import QrcodeVue from 'qrcode.vue'
import { mdiShareVariant, mdiQrcodeScan, mdiSend, mdiChevronRight } from '@mdi/js'
import { arrowBack } from 'ionicons/icons'

import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/service/toast.service'
import { useScanner } from '@/service/scanner.service'
import { createPersonalShareLink, shareUrl } from '@/helper/share.helper'
import { isNative, svg } from '@/helper/general.helper'
import { storeToRefs } from 'pinia'
import { useMenuStore } from '@/store/menu.store'
import { useProfileInspector } from '@/composables/profile/useProfileInspector'
import { useAPI } from '@/service/api/api.service'

// State
const isScanning = ref(false)
const video = ref<HTMLVideoElement>()
const mateName = ref('')
const isSearchingUsers = ref(false)
const foundMates = ref<any[]>([])

// Stores/Composables
const { user } = storeToRefs(useAuthStore())
const { toast } = useToast()
const { startScanning, stopScanning, resetScanning } = useScanner(video)
const { connectionMenuOpen } = storeToRefs(useMenuStore())
const { inspect } = useProfileInspector()
const { searchMate } = useAPI()

const qrURL = computed(() => createPersonalShareLink(user.value?._id || '', ''))

// Logic
const startCameraView = async () => {
  isScanning.value = true
  const code = await startScanning()
  if (code) {
    decode(new URL(code))
  }
}

const stopCameraView = () => {
  stopScanning()
  isScanning.value = false
}

async function searchUsers() {
  if (!mateName.value.trim() || !user.value) return
  isSearchingUsers.value = true
  try {
    const res = await searchMate({ mateName: mateName.value, user_id: user.value._id })
    foundMates.value = res || []
    if (foundMates.value.length === 0) {
      toast('No artists found with that name', { color: 'warning' })
    }
  } catch (e) {
    toast('Search failed', { color: 'danger' })
  } finally {
    isSearchingUsers.value = false
  }
}

function decode(url: URL) {
  const mateValue = url.searchParams.get('mate')
  if (!mateValue) {
    toast('Invalid sketchmate code', { color: 'danger' })
    isScanning.value = false
    return
  }
  inspect(mateValue)
  closeModal()
}

function closeModal() {
  modalController.dismiss()
}

function onDismiss() {
  stopScanning()
  resetScanning()
  isScanning.value = false
  connectionMenuOpen.value = false
  mateName.value = ''
  foundMates.value = []
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

.animate-fade-in {
  animation: fadeIn 0.3s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

ion-modal.liquid-connection-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto;
  --max-height: 96vh;
}

/* Custom Input Styling to match the "Liquid" theme */
input {
  appearance: none;
  -webkit-appearance: none;
}
</style>