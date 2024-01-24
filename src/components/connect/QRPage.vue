<template>
  <ion-modal :isOpen="open"
             @did-present="() => setAppColors(qrModalColorConfig)" @didDismiss="onDismiss">
    <ion-content>
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
          <ion-segment-button :value="Segments.scan" @click="startScanning" mode="md">
            <ion-label>Scan code</ion-label>
          </ion-segment-button>
        </ion-segment>
      </div>

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
  </ion-modal>
</template>

<script setup lang="ts">
import QrcodeVue from 'qrcode.vue'
import { arrowBack } from 'ionicons/icons'
import {
  IonButton,
  IonButtons,
  IonIcon,
  IonTitle,
  IonToolbar,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonModal,
  IonContent
} from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { isNative, setAppColors } from '@/helper/general.helper'
import {
  BarcodeFormat,
  BarcodeScanner,
  GoogleBarcodeScannerModuleInstallState
} from '@capacitor-mlkit/barcode-scanning'
import QrScanner from 'qr-scanner'
import { useToast } from '@/service/toast.service'
import { colorsPerRoute, qrModalColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'

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

const installingGoogleBarcode = ref(false)
const installingGoogleBarcodeProgress = ref<number | undefined>(0)


const qrScanner = ref<QrScanner>()
const video = ref<HTMLVideoElement>()
const qrURL = `${window.location.protocol}//${window.location.host}${window.location.pathname}?mate=${props._id}`

const { toast } = useToast()

onMounted(async () => {
  if (isNative()) {
    const isGoogleBarcodeScannerModuleAvailable = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()

    if (!isGoogleBarcodeScannerModuleAvailable.available) {
      installingGoogleBarcode.value = true
      await BarcodeScanner.installGoogleBarcodeScannerModule()
      BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', res => {
        if (res.state == GoogleBarcodeScannerModuleInstallState.COMPLETED) {
          installingGoogleBarcode.value = false
          BarcodeScanner.removeAllListeners()
        }
        installingGoogleBarcodeProgress.value = res.progress
      })
    }
  }
})

async function startScanning() {

  if (isNative()) {
    if (installingGoogleBarcode.value) {
      toast(
        `Still installing google barcode scanner, the status is ${installingGoogleBarcodeProgress.value}. Try again soon`
      )
      return
    }
    const supported = await BarcodeScanner.isSupported()

    if (!supported.supported) {
      toast('Camera not supported', { color: 'warning' })
      return
    }

    const status = await BarcodeScanner.requestPermissions()
    if (status.camera == 'granted') {
      document.querySelector('body')?.classList.add('barcode-scanner-active')


      if (isNative())  setTimeout(() => segment.value = Segments.code, 200)// hack in case the user presses the close button
      const { barcodes } = await BarcodeScanner.scan(
        {
          formats: [BarcodeFormat.QrCode]
        }
      )

      if (barcodes.length == 0) {
        stopScanning()
        return
      }
      decode(new URL(barcodes[0].rawValue))
    } else toast('Camera permission not granted or not available', { color: 'warning' })
  } else {
    if (!qrScanner.value)
      qrScanner.value = new QrScanner(video.value!, (code: any) => decode(new URL(code.data)), {
        highlightScanRegion: true,
        returnDetailedScanResult: true
      })
    await qrScanner.value?.start()
  }
}

function stopScanning() {
  if (!isNative()) qrScanner.value?.stop()
  else BarcodeScanner.stopScan()
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
