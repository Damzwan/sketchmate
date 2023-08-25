<template>
  <ion-modal
    mode="ios"
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
              fill="outline"
              placeholder="e.g. BiggusDickus"
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
                <li>Receive sketches from your mate</li>
                <li v-if="isNative()">Get daily reminders</li>
                <li v-if="isNative()">Use the SketchMate widget</li>
              </ul>
            </div>
          </div>

          <div class="w-full flex justify-center items-center pt-6">
            <ion-icon
              :icon="svg(user.subscription ? mdiBellRing : mdiBellOff)"
              class="w-[28px] h-[28px] pr-3 fill-gray-600"
            />
            <ion-toggle
              :checked="Boolean(user.subscription)"
              @ionChange="handleNotificationChange"
              mode="ios"
              :color="'secondary'"
            />
          </div>
        </div>

        <SettingLinks class="pb-2" />
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
import { ref } from 'vue'
import { useAppStore } from '@/store/app.store'
import { blurIonInput, compressImg, isNative, setAppColors, svg } from '@/helper/general.helper'
import { useAPI } from '@/service/api/api.service'
import { storeToRefs } from 'pinia'
import { useToast } from '@/service/toast.service'
import { arrowBack } from 'ionicons/icons'
import { onBeforeRouteLeave } from 'vue-router'
import { disableNotifications, requestNotifications } from '@/helper/notification.helper'
import { mdiBellOff, mdiBellRing } from '@mdi/js'
import { colorsPerRoute, settingsModalColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'
import router from '@/router'
import SettingLinks from '@/components/settings/SettingLinks.vue'
import ProfilePictureSelector from '@/components/general/ProfilePictureSelector.vue'

const { user } = storeToRefs(useAppStore())
const api = useAPI()
const { toast } = useToast()
const imgInput = ref<HTMLInputElement>()

const name = ref(user.value!.name)
const nameRef = ref<HTMLIonInputElement>()

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
    mate_id: user.value?.mate?._id,
    img: compressedImg,
    previousImage: user.value?.img?.includes('aku') ? undefined : user.value?.img
  })
  user.value!.img = imgUrl!
  toast('Changed profile picture')
}

function changeName() {
  api.changeUserName({
    _id: user.value!._id,
    mate_id: user.value?.mate?._id,
    name: name.value
  })
  user.value!.name = name.value
  toast('Changed name')
}

function onNameFocus() {
  name.value = ''
}

function onNameBlur() {
  if (name.value != '') changeName()
  else name.value = user.value!.name
}

function handleNotificationChange() {
  if (user.value!.subscription) {
    disableNotifications()
  } else requestNotifications()
}

onBeforeRouteLeave(() => close())
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
