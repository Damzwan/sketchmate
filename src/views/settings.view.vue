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
            <v-switch color="primary" inset prepend-icon="mdi-bell"
                      :model-value="notificationsAllowed" @update:modelValue="handleNotificationSwitch"></v-switch>
          </v-col>
        </v-row>

      </div>
    </div>

    <div v-else>
      <v-row dense>
        <v-col cols="12">
          <v-card
            color="red-darken-4"
            theme="dark"
          >
            <v-card-title class="text-h5">Welcome to SketchMate!</v-card-title>

            <v-card-subtitle class="no_wrap">Connect to a mate using one of the options below!</v-card-subtitle>

            <v-card-actions>
              <v-btn variant="text" append-icon="mdi-information" @click="isInfoModalOpen = true">Help</v-btn>
            </v-card-actions>
          </v-card>
        </v-col>

        <v-col cols="6">
          <v-card height="100%"
                  color="yellow-darken-4"
                  theme="dark"
          >
            <v-card-title class="text-h6">1: Link</v-card-title>

            <v-card-subtitle class="no_wrap">Share this link with your mate</v-card-subtitle>

            <v-card-actions class="align-center">
              <v-btn variant="text" append-icon="mdi-link" @click="share">Share Link</v-btn>
            </v-card-actions>
          </v-card>
        </v-col>

        <v-col cols="6">
          <v-card
            height="100%"
            color="green-darken-4"
            theme="dark"
          >
            <v-card-title class="text-h6">2: Scan</v-card-title>

            <v-card-subtitle class="no_wrap action_card">Scan the qr code of your mate
            </v-card-subtitle>

            <v-card-actions>
              <v-btn variant="text" append-icon="mdi-qrcode-scan" @click="isQRReaderOpen=!isQRReaderOpen">
                Scan QR
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-col>
      </v-row>


      <div class="qr d-flex justify-center align-center pt-16">
        <StreamBarcodeReader v-if="isQRReaderOpen" @decode="decode"></StreamBarcodeReader>
        <qrcode-vue v-else :value="user._id" :size="256"/>
      </div>
    </div>
  </v-container>
  <IntroModal/>
</template>

<script lang="ts" setup>
import {useAppStore} from '@/store/app.store';
import {ref, watch} from 'vue';
import {storeToRefs} from 'pinia';
import QrcodeVue from 'qrcode.vue'
import {useRouter} from 'vue-router';
import {StreamBarcodeReader} from "vue-barcode-reader";
import {useSocketService} from '@/service/socket.service';
import matchImg from '@/assets/illustrations/match.svg'
import {useNotificationHandler} from '@/service/notification.service';
import {useMessenger} from '@/service/messenger.service';
import IntroModal from '@/components/connect/IntroModal.vue';

const appStore = useAppStore();
const {showMsg} = useMessenger();
const {user, notificationsAllowed, isInfoModalOpen} = storeToRefs(appStore);
const router = useRouter();
const notificationHandler = useNotificationHandler()

const socketService = useSocketService();
const isQRReaderOpen = ref(false);
const query = router.currentRoute.value.query;


checkQueryParams();
watch(user, () => {
  checkQueryParams();
})

function checkQueryParams() {
  if (!(user.value && query.mate)) return;
  router.replace({query: undefined})
  const mate = query.mate.toString();
  if (mate === user.value._id) showMsg('error', 'Do not use your own share link')
  else if (user.value.mate) showMsg('error', 'You already have a mate')
  else match(mate)
}

function match(mate: string) {
  socketService.match({
    _id: user.value!._id,
    mate: mate
  })
}

function handleNotificationSwitch(isChecked: boolean) {
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

function decode(code: string) {
  isQRReaderOpen.value = false;
  match(code);
}

</script>

<style scoped>
.qr {
  width: 100%;
  height: 256px;
}

.no_wrap {
  white-space: normal !important;
}

</style>
