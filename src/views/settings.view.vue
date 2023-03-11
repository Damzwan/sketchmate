<template>
  <v-container v-if="user" class="h-100">
    <div v-if="user.mate" class="w-100 h-100 text-center d-flex justify-center align-center">
      <div>
        <v-img :src="matchImg" :height="200"/>
        <div class="pt-4">
          <h2>You are Matched!</h2>
          <p>To user <b>{{ user.mate }}</b></p>
        </div>

        <v-row justify="center" align="center" class="pt-10">
          <v-btn
            @click="unMatch"
            color="error"
            variant="outlined"
          >Unmatch
          </v-btn>
        </v-row>

        <v-row justify="center" align="center" class="pt-16">
          <v-col cols="6">
            <v-switch color="primary" inset :prepend-icon="mdiBell"
                      :model-value="notificationsAllowed" @update:modelValue="handleNotificationSwitch"></v-switch>
          </v-col>
        </v-row>

      </div>
    </div>

    <div v-else>
      <div class="text-h6 mb-3">Connect to a mate</div>
      <v-card rounded="xl" class="mb-3 d-inline-flex align-center w-100 px-3 py-1">
        <v-icon :icon="mdiHelpCircleOutline"/>
        <div class="text-subtitle-2 pl-2">How to connect</div>
      </v-card>

      <v-card rounded="xl" class="mb-3 d-inline-flex align-center w-100 px-3 py-1">
        <v-icon :icon="mdiPencilOutline"/>
        <div class="text-subtitle-2 pl-2">Edit name</div>
      </v-card>

      <v-card rounded="xl" :elevation="6" class="mb-3" @click="isQRReaderOpen ? stopScanning() : startScanning()">
        <v-row no-gutters>
          <v-col cols="8">
            <v-card-title class="card_title">Scan QR Code</v-card-title>
            <v-card-subtitle class="no_wrap card_subtitle">Become mates by scanning the QR Code of another user
            </v-card-subtitle>
            <v-card-actions class="pl-3">
              <v-btn variant="outlined" size="small">Scan QR Code</v-btn>
            </v-card-actions>
          </v-col>
          <v-col cols="4" class="d-flex justify-start align-center">
            <v-icon :icon="mdiCameraOutline" size="90%"/>
          </v-col>
        </v-row>
      </v-card>

      <v-card rounded="xl" :elevation="6" class="mb-3" @click="share">
        <v-row no-gutters>
          <v-col cols="8">
            <v-card-title class="card_title">Share Connect Link</v-card-title>
            <v-card-subtitle class="no_wrap card_subtitle">Become mates by scanning the QR Code of another user
            </v-card-subtitle>
            <v-card-actions class="pl-3">
              <v-btn variant="outlined" size="small">Share Link</v-btn>
            </v-card-actions>
          </v-col>
          <v-col cols="4" class="d-flex justify-start align-center">
            <v-icon :icon="mdiShareVariantOutline" size="90%"/>
          </v-col>
        </v-row>
      </v-card>


      <div v-show="isQRReaderOpen" ref="videoContainer">
        <v-toolbar v-if="isFullscreen" color="transparent">
          <template v-slot:prepend>
            <v-btn :icon="mdiClose" color="white" class="pa-0" @click="exit"/>
          </template>
        </v-toolbar>
        <video ref="video" class="w-100 h-100"/>
      </div>
      <div class="qr d-flex flex-column justify-center align-center w-100" v-if="!isQRReaderOpen">
        <qrcode-vue :value="user._id" :size="156" background="transparent"/>
        <div class="text-h6 pt-2">Connect with QR Code</div>
        <div class="text-caption w-50 text-center">Let someone scan this code to become mates</div>
      </div>
    </div>
  </v-container>
</template>

<script lang="ts" setup>
import {useAppStore} from '@/store/app.store';
import {ref, watch} from 'vue';
import {storeToRefs} from 'pinia';
import QrcodeVue from 'qrcode.vue'
import {useRouter} from 'vue-router';
import {useSocketService} from '@/service/socket.service';
import matchImg from '@/assets/illustrations/match.svg'
import {useNotificationHandler} from '@/service/notification.service';
import {useMessenger} from '@/service/messenger.service';
import {
  mdiBell,
  mdiCameraOutline,
  mdiClose,
  mdiHelpCircleOutline,
  mdiPencilOutline,
  mdiShareVariantOutline
} from '@mdi/js';
import QrScanner from 'qr-scanner';
import {useFullscreen} from '@vueuse/core';

const appStore = useAppStore();
const {showMsg} = useMessenger();
const {user, notificationsAllowed} = storeToRefs(appStore);
const router = useRouter();
const notificationHandler = useNotificationHandler()

const socketService = useSocketService();
const isQRReaderOpen = ref(false);
const query = router.currentRoute.value.query;

const video = ref<HTMLVideoElement>();
const videoContainer = ref<HTMLElement>();
const qrScanner = ref<QrScanner>();
const {isFullscreen, enter, exit} = useFullscreen(videoContainer)

checkQueryParams();
watch(user, () => {
  checkQueryParams();
})

watch(isFullscreen, () => {
  if (!isFullscreen.value) stopScanning();
})


function checkQueryParams() {
  if (!(user.value && query.mate)) return;
  router.replace({query: undefined})
  const mate = query.mate.toString();
  if (mate === user.value._id) showMsg('error', 'Do not use your own share link')
  else if (user.value.mate) showMsg('error', 'You already have a mate')
  else match(mate)
}

function startScanning() {
  qrScanner.value = new QrScanner(video.value!, decode, {highlightScanRegion: true, returnDetailedScanResult: true});
  enter()
  isQRReaderOpen.value = true;
  qrScanner.value?.start();
}

function stopScanning() {
  qrScanner.value?.stop();
  if (isFullscreen) exit();
  isQRReaderOpen.value = false;
}


function match(mate: string) {
  socketService.match({
    _id: user.value!._id,
    mate: mate
  })
}

function handleNotificationSwitch(isChecked: any) {
  isChecked ? notificationHandler.requestNotifications() : notificationHandler.unSubscribeNotifications();
}

function unMatch() {
  socketService.unMatch({
    _id: user.value!._id,
    mate: user.value!.mate as string
  })
}

function share() {
  const share_url = `${window.location.origin}${router.currentRoute.value.path}?mate=${user.value!._id}`
  if (navigator.share) {
    navigator.share({
      title: 'SketchMate',
      text: 'Become my mate on SketchMate!',
      url: share_url,
    })
  } else {
    navigator.clipboard.writeText(share_url);
    showMsg('success', 'Copied link!', undefined, undefined, 1000)
  }
}

function decode(code: any) {
  if (!isQRReaderOpen.value) return
  stopScanning();
  match(code.data);
}

</script>

<style scoped>
.qr {
  bottom: 20px;
  position: absolute;
  left: 0;
}

.no_wrap {
  white-space: normal !important;
}

.card_title {
  padding-bottom: 0;
}

.card_subtitle {
  font-size: 0.7rem;
  line-height: 1rem !important;
  font-weight: bold;
}
</style>
