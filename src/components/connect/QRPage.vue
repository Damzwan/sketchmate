<template>
  <ion-modal :isOpen="open"
             @did-present="() => setAppColors(qrModalColorConfig)" @didDismiss="onDismiss">
    <TopSafeArea :color="primaryColor" />
    <div class="w-full h-full flex flex-col safe-area">
      <div class="shadow">
        <ion-toolbar color="primary">
          <ion-buttons slot="start">
            <ion-button @click="close">
              <ion-icon :icon="arrowBack" />
            </ion-button>
          </ion-buttons>
          <ion-title>QR code</ion-title>
        </ion-toolbar>

        <ion-segment :value="segment" mode="md"
                     @ionChange="(e) => segment = e.detail.value" color="secondary">
          <ion-segment-button :value="Segments.code" @close="stopScanning" mode="md">
            <ion-label>My code</ion-label>
          </ion-segment-button>
          <ion-segment-button :value="Segments.scan" @click="startScanningHelper" mode="md">
            <ion-label>Scan code</ion-label>
          </ion-segment-button>
        </ion-segment>
      </div>

      <ion-content>
        <div class="w-full h-4/5 flex flex-col justify-center items-center" v-if="segment == Segments.code">
          <div class="pt-3 px-12 pb-5 bg-primary rounded-2xl flex flex-col justify-center items-center relative">
            <div class="w-full absolute left-0 top-[-40px] flex justify-center">
              <img :src="img" alt="QR img" width="64" class="rounded-full">
            </div>
            <p class="py-3 text-black font-bold text-xl">{{ name }}</p>
            <div class="bg-white rounded-2xl p-2">
              <qrcode-vue :value="qrURL" :size="156" background="white" />
            </div>
          </div>

          <p class="font-light text-base text-gray-700 pt-3">Let someone scan this code to become mates</p>
        </div>

        <div v-show="segment == Segments.scan" class="w-full h-4/5 flex flex-col justify-center items-center">
          <div class="w-full h-full flex justify-center items-center" v-show="!isNative()">
            <div class="max-w-[50rem]">
              <video ref="video" class="w-full h-full" />
            </div>
          </div>
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import QrcodeVue from 'qrcode.vue'
import { arrowBack } from 'ionicons/icons'
import {
  IonButton,
  IonButtons,
  IonContent,
  IonIcon,
  IonLabel,
  IonModal,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar
} from '@ionic/vue'
import { ref } from 'vue'
import { isNative, setAppColors } from '@/helper/general.helper'
import QrScanner from 'qr-scanner'
import { useToast } from '@/service/toast.service'
import { colorsPerRoute, primaryColor, qrModalColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { createPersonalShareLink } from '@/helper/share.helper'
import { useAuthStore } from '@/store/auth.store'
import TopSafeArea from '@/components/general/TopSafeArea.vue'
import { useScanner } from '@/service/scanner.service'

enum Segments {
  code,
  scan
}

const props = defineProps<{
  _id: string,
  name: string
  img: string,
  open: boolean
}>()

const emits = defineEmits(['update:open', 'scan'])

const segment = ref<Segments>(Segments.code)


const qrScanner = ref<QrScanner>()
const video = ref<HTMLVideoElement>()
const { startScanning, stopScanning, resetScanning } = useScanner(video)

const { user } = useAuthStore()
const qrURL = createPersonalShareLink(user!._id, '/connect')

const { toast } = useToast()


async function startScanningHelper() {
  const code = await startScanning()
  if (!code) return
  decode(new URL(code))
}


async function close() {
  stopScanning()
  emits('update:open', false)
}

function decode(url: any) {
  close()
  const mateValue: string | null = url.searchParams.get('mate')
  if (!mateValue) {
    toast('Invalid sketchmate code', { color: 'danger' })
    return
  }
  emits('scan', mateValue)
}

function onDismiss() {
  setAppColors(colorsPerRoute[FRONTEND_ROUTES.connect])
  resetScanning()
  segment.value = Segments.code
  qrScanner.value?.destroy()
  qrScanner.value = undefined
  emits('update:open', false)
}
</script>

<style scoped>
ion-segment {
  --background: var(--ion-color-primary)
}

ion-modal {
  --height: 100%;
  --width: 100%;
  --max-width: 100%;
  --background: var(--ion-color-tertiary);
}


</style>
