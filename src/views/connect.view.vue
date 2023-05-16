<template>
  <ion-page v-if="user">
    <ion-content v-show="scanning" class="scanner-active" />
    <SettingsHeader title="Connect" v-if="!scanning" />
    <ion-content v-show="!scanning">
      <div class="flex flex-col h-full">
        <div class="flex-grow justify-center items-center flex">
          <ion-grid>
            <ion-row class="ion-justify-content-center">
              <ion-col size="12" size-sm="5" size-md="4" class="flex justify-center align-center col">
                <ConnectMethod
                  title="Scan QR Code"
                  subtitle="Become mates by scanning the qr code of another user"
                  :img="cameraImg"
                  :action="startScanning"
                />
              </ion-col>
              <ion-col size="12" size-sm="5" size-md="4" class="flex justify-center align-center col">
                <ConnectMethod
                  title="Share connect link"
                  subtitle="The first person who clicks on this link will become your mate"
                  :img="shareImage"
                  :action="shareLink"
                />
              </ion-col>
            </ion-row>
          </ion-grid>
        </div>

        <div class="flex flex-col items-center justify-center w-full pb-12">
          <qrcode-vue :value="user._id" :size="156" background="transparent" />
          <p class="font-sans font-bold py-0.5">Connect with QR Code</p>
          <p class="font-sans font-light text-xs"> Let someone scan this code to become mates </p>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonCol, IonContent, IonGrid, IonPage, IonRow } from '@ionic/vue'
import SettingsHeader from '@/components/settings/SettingsHeader.vue'
import ConnectMethod from '@/components/connect/ConnectMethod.vue'
import cameraImg from '@/assets/illustrations/camera.svg'
import shareImage from '@/assets/illustrations/share.svg'
import { useAppStore } from '@/store/app.store'
import { storeToRefs } from 'pinia'
import QrcodeVue from 'qrcode.vue'
import { shareUrl } from '@/helper/share.helper'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { BarcodeScanner } from '@capacitor-community/barcode-scanner'
import { useSocketService } from '@/service/socket.service'
import { useToast } from '@/service/toast.service'
import { NotificationType } from '@/types/server.types'

const appStore = useAppStore()
const socketService = useSocketService()
const { user } = storeToRefs(appStore)
const route = useRoute()
const router = useRouter()
const { toast } = useToast()

const share_url = ref(`${window.location.origin}${route.path}?mate=${user.value!._id}`)

appStore.consumeNotificationLoading(NotificationType.unmatch)
checkQueryParams()

function checkQueryParams() {
  const query = router.currentRoute.value.query
  if (!(user.value && query.mate)) return
  router.replace({ query: undefined })
  const mate = query.mate.toString()
  if (mate === user.value._id) toast('Do not use your own share link', { color: 'error' })
  else if (user.value.mate) toast('You already have a mate', { color: 'error' })
  else {
    match(mate)
  }
}

function match(mate_id: string) {
  socketService.match({
    _id: user.value!._id,
    mate_id: mate_id
  })
}

const scanning = ref(false)

async function startScanning() {
  const status = await BarcodeScanner.checkPermission({ force: true })
  if (status.granted) {
    scanning.value = true
    await BarcodeScanner.hideBackground()
    const result = await BarcodeScanner.startScan() // start scanning and wait for a result
    if (result.hasContent) {
      scanning.value = false
      match(result.content)
    }
  } else {
    toast('Camera not available', { color: 'warning' })
  }
}

function shareLink() {
  shareUrl(share_url.value, 'Become my mate on Sketchmate', 'Send connect link')
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
</style>
