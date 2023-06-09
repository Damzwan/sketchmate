<template>
  <ion-modal :is-open="open" @will-dismiss="close" :presenting-element="presentingElement">
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
            <ion-avatar class="w-32 h-32 relative cursor-pointer" @click="() => imgInput!.click()">
              <img alt="Profile picture" :src="user.img" class="object-fill w-full h-full" />
              <ion-icon :icon="addOutline" class="badge rounded-full" />
            </ion-avatar>
            <input
              type="file"
              ref="imgInput"
              style="display: none"
              @change="uploadImage"
              accept="image/png, image/jpeg"
            />
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
            ></ion-input>
          </div>

          <div class="w-full flex justify-center items-center pt-6">
            <ion-icon :icon="svg(mdiBellRing)" class="w-[28px] h-[28px] pr-3 fill-gray-600" />
            <ion-toggle
              :checked="Boolean(user.subscription)"
              @ionChange="handleNotificationChange"
              mode="ios"
              :color="'secondary'"
            />
          </div>
        </div>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import {
  IonAvatar,
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
import { compressImg, svg } from '@/helper/general.helper'
import { useAPI } from '@/service/api/api.service'
import { storeToRefs } from 'pinia'
import { useToast } from '@/service/toast.service'
import { addOutline, arrowBack } from 'ionicons/icons'
import { onBeforeRouteLeave } from 'vue-router'
import { disableNotifications, requestNotifications } from '@/helper/notification.helper'
import { mdiBellRing } from '@mdi/js'

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
  emit('update:open', false)
}

async function uploadImage(e: any) {
  const file = e.target.files[0]
  const img = await compressImg(file, { size: 512 })
  const imgUrl = await api.uploadProfileImg({
    _id: user.value!._id,
    mate_id: user.value?.mate?._id,
    img: img,
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
  right: 3px;
  bottom: 10px;
  z-index: 4;
}

ion-modal {
  --height: 100%;
  --width: 100%;
}
</style>
