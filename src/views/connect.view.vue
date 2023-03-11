<template>
  <v-container v-if="user" class="h-100">
    <div v-if="user.mate" class="h-100">

      <div class="d-flex align-center justify-center flex-column pt-4">
        <v-avatar :image="user.img" :size="96" @click="() => fileInput.click()" style="cursor: pointer"/>
        <input type="file" ref="fileInput" style="display: none" @change="uploadImage" accept="image/png, image/jpeg">
        <v-text-field placeholder="e.g. BiggusDickus" variant="plain" density="compact" hide-details
                      class="name text-center"
                      v-model="name" ref="nameRef"
                      @update:focused="onNameFocus">
          <template v-slot:append-inner>
            <v-btn rounded variant="plain" color="accent" @click="changeName"
                   v-if="!(name === user.name || name === '')">Change
            </v-btn>
          </template>
        </v-text-field>
      </div>


      <div class="w-100 h-75 text-center d-flex justify-center align-center">
        <div>
          <v-img :src="matchImg" :height="200"/>
          <div class="pt-4">
            <div class="text-h5 font-weight-bold">You are matched!</div>
            <div class="text-subtitle-1">To {{ user.mate.name }}</div>
          </div>

          <v-row justify="center" align="center" class="pt-10">
            <v-btn @click="unMatch" color="error" variant="outlined">Unmatch</v-btn>
          </v-row>

          <v-row justify="center" align="center" class="pt-16">
            <v-col cols="8">
              <v-switch
                color="accent"
                inset
                :prepend-icon="mdiBellRing"
                v-model="notificationsAllowed"
                @update:modelValue="handleNotificationSwitch"
              ></v-switch>
            </v-col>
          </v-row>
        </div>
      </div>
    </div>

    <div v-else>
      <div class="text-h6 mb-3">Connect to a mate</div>
      <v-row dense>
        <v-col cols="12">
          <v-card
            rounded="xl"
            color="primary"
            class="d-inline-flex align-center w-100 px-3 py-1"
            :elevation="3"
            @click="router.push(FRONTEND_ROUTES.tutorial)"
          >
            <v-icon :icon="mdiHelpCircleOutline"/>
            <div class="text-subtitle-2 pl-2">How to connect</div>
          </v-card>
        </v-col>

        <v-col cols="12">
          <v-card
            rounded="xl"
            color="primary"
            class="d-inline-flex align-center w-100 px-3 py-1"
            :elevation="3"
            @click="isChangeNameDialogOpen = true"
          >
            <v-icon :icon="mdiPencilOutline"/>
            <div class="text-subtitle-2 pl-2">Change name {{ user.name ? `(${user.name})` : '' }}</div>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6">
          <v-card rounded="xl" :elevation="3" class="mb-3" @click="startScanning()" color="primary">
            <v-row no-gutters>
              <v-col cols="8">
                <v-card-title class="card_title">Scan QR Code</v-card-title>
                <v-card-subtitle class="no_wrap card_subtitle"
                >Become mates by scanning the QR Code of another user
                </v-card-subtitle>
                <v-card-actions class="pl-3">
                  <v-btn variant="outlined" size="small">Scan QR Code</v-btn>
                </v-card-actions>
              </v-col>
              <v-col cols="3" class="d-flex justify-start align-center">
                <v-img :src="cameraImg" cover/>
              </v-col>
            </v-row>
          </v-card>
        </v-col>

        <v-col cols="12" sm="6">
          <v-card rounded="xl" :elevation="3" class="mb-3" @click="share" color="primary">
            <v-row no-gutters>
              <v-col cols="8">
                <v-card-title class="card_title">Share Connect Link</v-card-title>
                <v-card-subtitle class="no_wrap card_subtitle">
                  The first person who clicks on this link will become your mate
                </v-card-subtitle>
                <v-card-actions class="pl-3">
                  <v-btn variant="outlined" size="small">Share Link</v-btn>
                </v-card-actions>
              </v-col>
              <v-col cols="3" class="d-flex justify-start align-center">
                <v-img :width="300" :src="shareImg" cover/>
                <!--                <v-icon :icon="mdiShareVariantOutline" size="90%"/>-->
              </v-col>
            </v-row>
          </v-card>
        </v-col>
      </v-row>

      <div v-show="isQRReaderOpen" ref="videoContainer">
        <v-toolbar v-if="isFullscreen" color="transparent">
          <template v-slot:prepend>
            <v-btn :icon="mdiClose" color="white" class="pa-0" @click="stopScanning"/>
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
import QrcodeVue from 'qrcode.vue';
import {useRoute, useRouter} from 'vue-router';
import {useSocketService} from '@/service/socket.service';
import matchImg from '@/assets/illustrations/match.svg';
import shareImg from '@/assets/illustrations/share.svg';
import cameraImg from '@/assets/illustrations/camera.svg';
import {useNotifications} from '@/service/notification.service';
import {useMessenger} from '@/service/messenger.service';
import {mdiBellRing, mdiClose, mdiHelpCircleOutline, mdiPencilOutline} from '@mdi/js';
import QrScanner from 'qr-scanner';
import {useClipboard, useFullscreen, useShare} from '@vueuse/core';
import {FRONTEND_ROUTES} from '@/types/app.types';
import {useAPI} from '@/service/api.service';
import {VTextField} from 'vuetify/components';
import {createProfilePicture} from '@/helper/general.helper';

const appStore = useAppStore();
const {showMsg} = useMessenger();
const {user, notificationsAllowed} = storeToRefs(appStore);
const router = useRouter();
const notificationHandler = useNotifications();

const socketService = useSocketService();
const api = useAPI();
const isQRReaderOpen = ref(false);
const query = router.currentRoute.value.query;

const isChangeNameDialogOpen = ref(false);

const video = ref<HTMLVideoElement>();
const videoContainer = ref<HTMLElement>();
const qrScanner = ref<QrScanner>();
const {isFullscreen, enter, exit} = useFullscreen(videoContainer);
const route = useRoute();

const share_url = ref(`${window.location.origin}${route.path}?mate=${user.value!._id}`);

const {copy, isSupported: isCopySupported} = useClipboard({source: share_url})
const {isSupported: isShareSupport} = useShare()

const name = ref(user.value!.name)
const nameRef = ref<HTMLInputElement>()

const fileInput = ref<HTMLInputElement>()

checkQueryParams();

watch(isFullscreen, (value) => {
  if (!value) stopScanning()
})

function checkQueryParams() {
  if (!(user.value && query.mate)) return;
  router.replace({query: undefined});
  const mate = query.mate.toString();
  if (mate === user.value._id) showMsg('error', 'Do not use your own share link');
  else if (user.value.mate) showMsg('error', 'You already have a mate');
  else match(mate);
}

function startScanning() {
  qrScanner.value = new QrScanner(video.value!, decode, {highlightScanRegion: true, returnDetailedScanResult: true});
  enter();
  isQRReaderOpen.value = true;
  qrScanner.value?.start();
}

function stopScanning() {
  qrScanner.value?.stop();
  if (isFullscreen.value) exit();
  isQRReaderOpen.value = false;
}

function match(mate_id: string) {
  socketService.match({
    _id: user.value!._id,
    mate_id: mate_id,
  });
}

function handleNotificationSwitch(isChecked: any) {
  isChecked ? notificationHandler.requestNotifications() : notificationHandler.unSubscribeNotifications();
}

function unMatch() {
  socketService.unMatch({
    _id: user.value!._id,
    mate_id: user.value!.mate!._id,
  });
}

async function share() {
  if (isShareSupport.value) {
    await navigator.share({
      title: 'SketchMate',
      text: 'Become my mate on SketchMate!',
      url: share_url.value,
    })
  } else if (isCopySupported.value) {
    await copy();
    showMsg('success', 'Copied link!', undefined, undefined, 1000);
  }
}

function decode(code: any) {
  if (!isQRReaderOpen.value) return;
  stopScanning();
  match(code.data);
}

function onNameFocus(focusedIn: boolean) {
  name.value = focusedIn ? '' : user.value!.name
}

function changeName() {
  api.changeUserName({
    _id: user.value!._id,
    mate_id: user.value?.mate?._id,
    name: name.value
  })
  user.value!.name = name.value
  nameRef.value!.blur()
  showMsg('success', 'changed name')
}

async function uploadImage(e: any) {
  const file = e.target.files[0];
  const img = await createProfilePicture(file);

  const imgUrl = await api.uploadProfileImg({
    _id: user.value!._id,
    mate_id: user.value?.mate?._id,
    img: img,
    previousImage: user.value?.img?.includes('aku') ? undefined : user.value?.img
  })

  user.value!.img = imgUrl!
  showMsg('success', 'Changed profile picture')
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

.h-90 {
  height: 90%;
}

.name {
  width: 300px;
}

.name >>> input {
  text-align: center
}
</style>
