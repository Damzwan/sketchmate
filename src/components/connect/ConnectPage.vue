<template>
  <ion-page>
    <ion-content v-show="scanning" class="scanner-active" />

    <SettingsHeader title="Connect" v-if="!scanning" />
    <ion-content v-show="!scanning">
      <div v-show="isQRReaderOpen" ref="videoContainer">
        <ion-toolbar color="transparent">
          <ion-buttons>
            <ion-button @click="stopScanning">
              <ion-icon slot="icon-only" :icon="svg(mdiClose)" class="fill-white"></ion-icon>
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
        <div class="w-full h-3/4 flash justify-center items-center grid">
          <video ref="video" />
        </div>
      </div>

      <div class="flex flex-col h-full space-y-2">
        <div class="flex flex-wrap justify-center items-center sm:space-x-16 flex-grow">
          <ConnectMethod
            class="w-full sm:w-1/2 md:w-1/3"
            title="Scan QR Code"
            subtitle="Become mates by scanning the qr code of another user"
            :img="cameraImg"
            :action="startScanning"
          />
          <ConnectMethod
            class="w-full sm:w-1/2 md:w-1/3"
            title="Share connect link"
            subtitle="The first person who clicks on this link will become your mate"
            :img="shareImage"
            :action="shareLink"
          />
        </div>

        <div class="flex flex-col links">
          <ion-button fill="clear" color="secondary" id="connect_help">Help with Connection</ion-button>
          <ConnectHelpModal />
          <ion-button fill="clear" color="secondary" @click="enterTrialMode">Test Drawing</ion-button>
        </div>

        <div class="flex flex-col items-center justify-center w-full pb-4">
          <qrcode-vue :value="`${fullUrl}?mate=${user?._id}`" :size="128" background="transparent" />
          <p class="font-sans font-bold py-0.5">Connect with QR Code</p>
          <p class="font-sans font-light text-xs"> Let someone scan this code to become mates </p>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonButton, IonButtons, IonContent, IonIcon, IonPage, IonToolbar } from '@ionic/vue'
import SettingsHeader from '@/components/settings/SettingsHeader.vue'
import ConnectMethod from '@/components/connect/ConnectMethod.vue'
import cameraImg from '@/assets/illustrations/camera.svg'
import shareImage from '@/assets/illustrations/share.svg'
import { useAppStore } from '@/store/app.store'
import { storeToRefs } from 'pinia'
import QrcodeVue from 'qrcode.vue'
import { shareUrl } from '@/helper/share.helper'
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSocketService } from '@/service/api/socket.service'
import { useToast } from '@/service/toast.service'
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'
import QrScanner from 'qr-scanner'
import { useFullscreen } from '@vueuse/core'
import { isNative, svg } from '@/helper/general.helper'
import { mdiClose } from '@mdi/js'
import ConnectHelpModal from '@/components/connect/ConnectHelpModal.vue'
import { FRONTEND_ROUTES } from '@/types/router.types'

const appStore = useAppStore()
const socketService = useSocketService()
const { user, localUserId } = storeToRefs(appStore)
const route = useRoute()
const router = useRouter()
const { toast } = useToast()

const qrScanner = ref<QrScanner>()
const video = ref<HTMLVideoElement>()
const videoContainer = ref<HTMLElement>()
const { isFullscreen, enter, exit } = useFullscreen(videoContainer)
const isQRReaderOpen = ref(false)

const { setQueryParams } = useAppStore()
const { queryParams, isLoggedIn } = storeToRefs(useAppStore())

const fullUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}`

watch(isFullscreen, value => {
  if (!value) stopScanning()
})

watch(isLoggedIn, checkQueryParams)
onMounted(checkQueryParams)

watch(queryParams, value => {
  if (value) checkQueryParams()
})

function createShareUrl() {
  let baseUrl
  if (isNative()) baseUrl = import.meta.env.VITE_FRONTEND as string
  else baseUrl = `${window.location.origin}`
  return `${baseUrl}${route.path}?mate=${user.value!._id}`
}

function enterTrialMode() {
  router.push(`${FRONTEND_ROUTES.draw}?trial=true`)
}

function checkQueryParams() {
  if (!user.value) return

  const mateId = queryParams.value ? queryParams.value.get('mate') : router.currentRoute.value.query.mate?.toString()
  if (!mateId) return
  setQueryParams(undefined)
  router.replace({ query: undefined })
  if (mateId === user.value._id) toast('Do not use your own share link', { color: 'warning' })
  else if (user.value.mate) toast('You already have a mate', { color: 'danger' })
  else match(mateId)
}

function match(mate_id: string) {
  socketService.match({
    _id: user.value!._id,
    mate_id: mate_id
  })
}

const scanning = ref(false)

async function startScanning() {
  if (isNative()) {
    const supported = await BarcodeScanner.isSupported()

    if (!supported.supported) {
      toast('Camera not supported', { color: 'warning' })
      return
    }

    const status = await BarcodeScanner.requestPermissions()
    if (status.camera == 'granted') {
      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode]
      })
      const url = new URL(barcodes[0].rawValue)
      const mateValue: string | null = url.searchParams.get('mate')
      if (!mateValue) {
        toast('Invalid sketchmate code', { color: 'danger' })
        return
      }
      match(mateValue)
    } else toast('Camera permission not granted or not available', { color: 'warning' })
  } else {
    qrScanner.value = new QrScanner(video.value!, decode, { highlightScanRegion: true, returnDetailedScanResult: true })
    enter()
    isQRReaderOpen.value = true
    qrScanner.value?.start()
  }
}

function stopScanning() {
  qrScanner.value?.stop()
  if (isFullscreen.value) exit()
  isQRReaderOpen.value = false
}

function decode(code: any) {
  if (!isQRReaderOpen.value) return
  stopScanning()

  const url = new URL(code.data)
  const mateValue: string | null = url.searchParams.get('mate')
  if (!mateValue) {
    toast('Invalid sketchmate code', { color: 'danger' })
    return
  }
  match(mateValue)
}

function shareLink() {
  shareUrl(createShareUrl(), 'Become my mate on Sketchmate', 'Send connect link')
}
</script>

<style lang="scss" scoped>
ion-header {
  --background: #ffd4b2;
}

.col {
  padding: 0;
}

.scanner-active {
  --background: transparent;
  --ion-background-color: transparent;
}

@media screen and (max-height: 700px) {
  ion-button {
    height: 35px !important;
    min-height: 35px !important;
  }
}
</style>
