<template>
  <ion-page>
    <SettingsHeader title="My Mates" v-if="!user" />
    <div v-else class="z-10 shadow">
      <SettingsHeader title="My Mates" />
      <ion-toolbar color="tertiary">
        <ion-segment :value="segment" mode="md"
                     @ionChange="(e) => segment = e.detail.value" color="secondary">
          <ion-segment-button :value="Segments.friends">
            <ion-label>My mates {{ user?.mates.length > 0 ? `(${user?.mates.length})` : '' }}</ion-label>
          </ion-segment-button>
          <ion-segment-button :value="Segments.requests" @click="fetchFriendRequests">
            <ion-label>Requests {{ requestsSize > 0 ? `(${requestsSize})` : '' }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </div>
    <ion-content color="tertiary">
      <ion-refresher slot="fixed" @ionRefresh="refresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>
      <CircularLoader v-if="!user " />
      <div class="w-full h-full" v-else>
        <CircularLoader v-show="isLoading" class="absolute w-full h-full z-50" />

        <div class="w-full h-full" v-if="segment == Segments.friends">

          <div class="w-full h-5/6 flex-col flex justify-center" v-if="user.mates.length == 0">
            <img :src="friendsImage" class="w-full h-[16rem] md:h-[18rem]" alt="friends connect" />
            <div class="w-full flex flex-col justify-center items-center pt-3">
              <h1 class="text-2xl font-bold">Start connecting</h1>
              <p class="px-5 text-center text-lg">Add a friend to start sending sketches to each other</p>
              <ion-button color="secondary" @click="isConnectSheetOpen = true" class="pt-2">Add friend
              </ion-button>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 p-2">
            <button v-for="mate of user!.mates" :key="mate" @click="openUnMatchSheet(mate)"
                    class="hover:bg-primary-shade border-secondary-light border-2 bg-primary col-span-1 shadow rounded-2xl">
             <ConnectUserItem :mate="mate"/>
            </button>
          </div>
        </div>

        <div v-else class="w-full h-full">
          <CircularLoader v-if="loadingFriendRequests" class="w-full h-full z-50" />
          <div v-else class="w-full h-5/6">
            <div v-if="requestsSize == 0" class="flex flex-col justify-center w-full h-full">

              <img :src="noMessagesImg" alt="No messages" class="h-[16rem] md:h-[18rem] aspect-square" />
              <div class="w-full flex justify-center items-center flex-col pt-3">
                <h1 class="text-2xl font-bold">No friend requests...</h1>
                <p class="px-5 text-center text-lg">Over here you can manage your received and sent friend requests</p>
                <ion-button color="secondary" @click="segment = Segments.friends" class="pt-2">Go back
                </ion-button>
              </div>
            </div>

            <div v-else class="p-2">
              <div v-if="user && user?.mate_requests_received.length > 0">
                <h1 class="text-lg font-bold pl-3">Received ({{ user.mate_requests_received.length }})</h1>
                <ion-list>
                  <ion-item v-for="mateRequest in user.mate_requests_received" :key="mateRequest">
                    <img :src="senderImg(findUserInFriendRequestUsers(mateRequest))" :alt="mateRequest"
                         class="rounded-full w-[48px] my-2" slot="start">
                    <h2 class="font-medium text-lg">{{ senderName(findUserInFriendRequestUsers(mateRequest)) }}</h2>

                    <div slot="end">
                      <ion-spinner color="secondary" v-if="friendRequestLoading" />
                      <div v-else>
                        <ion-button color="secondary" fill="clear"
                                    @click="refuseSendMateRequest({sender: user._id, sender_name: user.name, receiver: mateRequest})">
                          Refuse
                        </ion-button>

                        <ion-button color="secondary" fill="clear"
                                    @click="match({_id: user._id, mate_id: mateRequest})">
                          Accept
                        </ion-button>
                      </div>
                    </div>
                  </ion-item>
                </ion-list>
              </div>

              <div v-if="user && user?.mate_requests_sent.length > 0">
                <h1 class="text-lg font-bold pl-3">Sent ({{ user.mate_requests_sent.length }})</h1>
                <ion-list>
                  <ion-item v-for="mateRequest in user.mate_requests_sent" :key="mateRequest">
                    <img :src="senderImg(findUserInFriendRequestUsers(mateRequest))" :alt="mateRequest"
                         class="rounded-full w-[48px] my-2" slot="start">
                    <h2 class="font-medium text-lg">{{ senderName(findUserInFriendRequestUsers(mateRequest)) }}</h2>

                    <div slot="end">
                      <ion-spinner color="secondary" v-if="friendRequestLoading" />
                      <div v-else>
                        <ion-button color="secondary" fill="clear"
                                    @click="cancelSendMateRequest({sender: user._id, sender_name: user.name, receiver: mateRequest})">
                          Undo request
                        </ion-button>
                      </div>
                    </div>
                  </ion-item>
                </ion-list>
              </div>
            </div>

          </div>
        </div>

        <ion-fab slot="fixed" vertical="bottom" horizontal="end">
          <ion-fab-button color="secondary" @click="isConnectSheetOpen = true">
            <ion-icon :icon="add"></ion-icon>
          </ion-fab-button>
        </ion-fab>
      </div>

      <ion-action-sheet :is-open="isUnMatchSheetOpen" @didDismiss="isUnMatchSheetOpen = false"
                        class="custom-action-sheet"
                        :buttons="unMatchSheetButtons" mode="ios" />

      <ion-action-sheet :is-open="isConnectSheetOpen" @didDismiss="isConnectSheetOpen = false"
                        class="custom-action-sheet"
                        :buttons="connectSheetButtons" mode="ios" header="Connect to a mate" />

    </ion-content>
    <QRPage v-model:open="showQRPage" :_id="user._id" :img="user.img" :name="user.name" v-if="user"
            @scan="(mateID: string) => match({_id: user!._id, mate_id: mateID})" />
  </ion-page>

</template>

<script setup lang="ts">

import noMessagesImg from '@/assets/illustrations/no-messages.svg'
import SettingsHeader from '@/components/settings/SettingsHeader.vue'
import { storeToRefs } from 'pinia'
import CircularLoader from '@/components/loaders/CircularLoader.vue'
import {
  IonActionSheet,
  IonButton,
  IonContent,
  IonFab,
  IonFabButton,
  IonSpinner,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonSegment,
  IonSegmentButton,
  IonToolbar,
  onIonViewDidLeave, IonRefresherContent, IonRefresher
} from '@ionic/vue'
import { useAppStore } from '@/store/app.store'
import { add } from 'ionicons/icons'
import { computed, onMounted, ref, watch } from 'vue'
import { Mate } from '@/types/server.types'
import { senderImg, senderName, svg } from '@/helper/general.helper'
import { mdiLink, mdiQrcode } from '@mdi/js'
import { createPersonalShareLink, shareUrl } from '@/helper/share.helper'
import { useRoute } from 'vue-router'
import QRPage from '@/components/connect/QRPage.vue'
import { useSocketService } from '@/service/api/socket.service'
import router from '@/router'
import { useToast } from '@/service/toast.service'
import friendsImage from '@/assets/illustrations/match.svg'
import ConnectUserItem from '@/components/connect/ConnectUserItem.vue'

enum Segments {
  friends = 'friends',
  requests = 'request'
}

const { user, queryParams, isLoading, friendRequestLoading, friendRequestUsers } = storeToRefs(useAppStore())
const { setQueryParams, retrieveFriendRequestUsers, findUserInFriendRequestUsers, refresh } = useAppStore()

const route = useRoute()

const isUnMatchSheetOpen = ref(false)
const mateToUnMatch = ref<Mate>()

const showQRPage = ref(false)
const { match, unMatch, refuseSendMateRequest, cancelSendMateRequest } = useSocketService()

const { toast } = useToast()
const requestsSize = computed(() => user.value ? user.value.mate_requests_received.length + user.value.mate_requests_sent.length : 0)

const loadingFriendRequests = ref(false)

onIonViewDidLeave(() => segment.value = Segments.friends)

watch(queryParams, value => {
  if (value) checkQueryParams()
})
onMounted(checkQueryParams)
watch(user, checkQueryParams)
watch(route, checkQueryParams)

const segment = ref<Segments>(route.query && route.query.tab == 'request' ? Segments.requests : Segments.friends)

const unMatchSheetButtons = [
  {
    text: 'Unmatch',
    role: 'destructive',
    data: {
      action: 'delete'
    },
    handler: () => unMatch({ mate_id: mateToUnMatch.value!._id, _id: user.value!._id, name: user.value!.name })
  },
  {
    text: 'Cancel',
    role: 'cancel',
    data: {
      action: 'cancel'
    }
  }
]

const isConnectSheetOpen = ref(false)
const connectSheetButtons = [
  {
    text: 'Share Link',
    role: 'selected',
    icon: svg(mdiLink),
    data: {
      action: 'delete'
    },
    handler: () => shareUrl(createPersonalShareLink(user.value!._id, route.path), 'Become my mate on Sketchmate', 'Send connect link')
  },
  {
    text: 'QR Code',
    role: 'selected',
    icon: svg(mdiQrcode),
    data: {
      action: 'delete'
    },
    handler: () => showQRPage.value = true
  },
  {
    text: 'Cancel',
    role: 'cancel',
    data: {
      action: 'cancel'
    }
  }
]

function checkQueryParams() {
  if (!user.value) return

  if (route.query && route.query.tab) {
    segment.value = route.query.tab as Segments
    fetchFriendRequests()
    router.replace({ query: undefined })
  }

  const mateId = queryParams.value ? queryParams.value.get('mate') : router.currentRoute.value.query.mate?.toString()
  if (!mateId) return
  setQueryParams(undefined)
  router.replace({ query: undefined })
  if (mateId === user.value._id) toast('Do not use your own share link', { color: 'warning' })
  else if (user.value.mates.some(m => m._id == mateId)) toast('You are already connected to this mate', { color: 'danger' })
  else match({ _id: user.value._id, mate_id: mateId })
}


function openUnMatchSheet(mate: Mate) {
  mateToUnMatch.value = mate
  isUnMatchSheetOpen.value = true
}


async function fetchFriendRequests() {
  if (friendRequestUsers.value.length >= requestsSize.value) return
  loadingFriendRequests.value = true
  await retrieveFriendRequestUsers()
  loadingFriendRequests.value = false
}
</script>

<style scoped>
ion-segment {
  --background: var(--ion-color-background);
}
</style>

<style>
ion-action-sheet.custom-action-sheet {
  --background: var(--ion-color-background);
  --button-background-selected: var(--ion-color-background);
  --button-color: var(--ion-color-contrast-2);
}

ion-action-sheet.custom-action-sheet .action-sheet-title {
  @apply text-gray-600
}

ion-action-sheet.custom-action-sheet .action-sheet-cancel {
  @apply hover:text-secondary-light text-secondary
}
</style>