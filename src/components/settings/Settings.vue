<template>
  <ion-modal
    :is-open="open"
    @will-dismiss="close"
    :presenting-element="presentingElement"
    @will-present="() => setAppColors(settingsModalColorConfig)"
  >
    <ion-header class="ion-no-border">
      <ion-toolbar color="tertiary">
        <ion-buttons slot="start">
          <ion-button @click="close">
            <ion-icon :icon="arrowBack" />
          </ion-button>
        </ion-buttons>
        <ion-title>Settings</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content v-if="user">
      <div class="flex flex-col h-full">
        <div class="flex-grow">
          <div class="w-full flex justify-center items-center pt-8">
            <ProfilePictureSelector :img="user.img" @update:img="img => uploadImage(img)" />
          </div>

          <div class="w-full justify-center flex pt-8">
            <ion-input
              class="w-1/2 max-w-xs"
              helperText="Name"
              type="text"
              maxlength="30"
              fill="outline"
              placeholder="e.g. SketchMater"
              v-model="name"
              ref="nameRef"
              @ionFocus="onNameFocus"
              @ionBlur="onNameBlur"
              @keyup.enter="onEnter"
              enterkeyhint="done"
              autocapitalize="sentences"
            ></ion-input>
          </div>

          <div class="p-6 text-gray-500 text-sm mx-auto flex flex-col items-center justify-center">
            <p class="text-lg -ml-12">Enable notifications to:</p>
            <div>
              <ul class="list-disc list-inside">
                <li>Receive sketches from your friends</li>
                <li v-if="isNative()">Get daily reminders</li>
                <li v-if="isNative()">Use the SketchMate widget</li>
              </ul>
            </div>
          </div>

          <div class="w-full flex justify-center items-center py-3">
            <ion-icon
              :icon="svg(deviceNotificationsAllowed ? mdiBellRing : mdiBellOff)"
              class="w-[28px] h-[28px] pr-3 fill-gray-600"
            />
            <ion-toggle
              :checked="deviceNotificationsAllowed"
              @ionChange="handleNotificationChange"
              mode="ios"
              :color="'secondary'"
            />
          </div>

          <div class="w-full flex justify-center items-center">
            <ConfirmationAlert header="Remove subscription"
                               message="You will no longer receive notifications on this device"
                               v-model:isOpen="deleteSubscriptionAlertOpen" confirmationtext="Delete"
                               @confirm="deleteSubscription" />
            <ion-accordion-group v-if="user.subscriptions.length > 0">
              <ion-accordion value="first">
                <ion-item slot="header">
                  <ion-label>Active Devices
                    {{ user.subscriptions.length > 0 ? `(${user.subscriptions.length})` : '' }}
                  </ion-label>
                </ion-item>
                <div class="ion-padding" slot="content">
                  <ion-item v-for="subscription of user.subscriptions" :key="subscription.fingerprint">
                    <ion-icon aria-hidden="true" :icon="svg(mdiClose)" slot="end" class="fill-red-600 cursor-pointer"
                              @click="openDeleteSubscriptionAlert(subscription)" />
                    {{ subscription.model }}, {{ subscription.platform }}
                  </ion-item>
                </div>
              </ion-accordion>
            </ion-accordion-group>
          </div>
        </div>

        <SettingLinks />
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonModal,
  IonTitle,
  IonToggle,
  IonToolbar
} from '@ionic/vue'
import { computed, ref } from 'vue'
import { useAppStore } from '@/store/app.store'
import {
  blurIonInput,
  compressImg,
  isNative,
  setAppColors,
  svg
} from '@/helper/general.helper'
import { useAPI } from '@/service/api/api.service'
import { storeToRefs } from 'pinia'
import { useToast } from '@/service/toast.service'
import { arrowBack } from 'ionicons/icons'
import { onBeforeRouteLeave } from 'vue-router'
import { disableNotifications, requestNotifications, setNotificationsAllowed } from '@/helper/notification.helper'
import { mdiBellOff, mdiBellRing, mdiClose } from '@mdi/js'
import { colorsPerRoute, settingsModalColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'
import router from '@/router'
import SettingLinks from '@/components/settings/SettingLinks.vue'
import ProfilePictureSelector from '@/components/general/ProfilePictureSelector.vue'
import { EventBus } from '@/main'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import { NotificationSubscription } from '@/types/server.types'

const { user, deviceFingerprint, notificationsAllowed } = storeToRefs(useAppStore())
const api = useAPI()
const { toast } = useToast()

const name = ref(user.value!.name)
const nameRef = ref<HTMLIonInputElement>()

const deleteSubscriptionAlertOpen = ref(false)
const subscriptionToDelete = ref<NotificationSubscription>()

setNotificationsAllowed()

EventBus.on('reset-name', () => name.value = user.value!.name)

defineProps({
  open: {
    type: Boolean,
    required: true
  },
  presentingElement: {
    type: HTMLElement,
    required: false
  }
})
const emit = defineEmits(['update:open'])
const deviceNotificationsAllowed = computed(() => user.value?.subscriptions.some(s => s.fingerprint == deviceFingerprint.value) && notificationsAllowed.value)

function close() {
  setAppColors(colorsPerRoute[router.currentRoute.value.fullPath.split('/')[1] as FRONTEND_ROUTES])
  emit('update:open', false)
}

function onEnter() {
  blurIonInput(nameRef.value)
}

async function uploadImage(img: any) {
  const compressedImg = await compressImg(img, { size: 256 })
  const imgUrl = await api.uploadProfileImg({
    _id: user.value!._id,
    img: compressedImg,
    previousImage: user.value?.img?.includes('aku') ? undefined : user.value?.img
  })
  user.value!.img = imgUrl!
  toast('Changed profile picture')
}

function changeName() {
  api.changeUserName({
    _id: user.value!._id,
    name: name.value
  })
  user.value!.name = name.value
  toast('Changed name')
}

function onNameFocus() {
  // name.value = ''
}

function onNameBlur() {
  if (name.value != '') changeName()
  else name.value = user.value!.name
}

function handleNotificationChange() {
  deviceNotificationsAllowed.value ? disableNotifications() : requestNotifications()
}

function deleteSubscription() {
  api.unsubscribe({ user_id: user.value!._id, fingerprint: subscriptionToDelete.value!.fingerprint })
  user.value!.subscriptions = user.value!.subscriptions.filter(sub => sub.fingerprint != subscriptionToDelete.value!.fingerprint)
}

onBeforeRouteLeave(() => close())

function openDeleteSubscriptionAlert(subscription: NotificationSubscription) {
  subscriptionToDelete.value = subscription
  deleteSubscriptionAlertOpen.value = true
}
</script>

<style scoped lang="scss">
.badge {
  background: var(--ion-color-secondary);
  position: absolute;
  right: 12px;
  bottom: 10px;
  z-index: 4;
}

ion-modal {
  --height: 100%;
  --width: 100%;
  --max-width: 100%;
}
</style>
