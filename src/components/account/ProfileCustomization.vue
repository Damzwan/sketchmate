<template>
  <div class="w-full flex justify-center items-center pt-4">
    <ProfilePictureSelector :img="user.img" @update:img="img => uploadImage(img)" />
  </div>

  <div class="w-full justify-center flex pt-6">
    <ion-input
      class="w-1/2 max-w-xs"
      color="secondary"
      helperText="Name"
      type="text"
      maxlength="30"
      fill="outline"
      placeholder="e.g. SketchMater"
      v-model="name"
      ref="nameRef"
      @ionBlur="onNameBlur"
      @keyup.enter="onEnter"
      enterkeyhint="done"
      autocapitalize="sentences"
    ></ion-input>
  </div>

</template>

<script setup lang="ts">
import ProfilePictureSelector from '@/components/account/ProfilePictureSelector.vue'
import { IonInput } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { ref } from 'vue'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'
import { blurIonInput, compressImg } from '@/helper/general.helper'
import { EventBus } from '@/main'

const { user } = storeToRefs(useAuthStore())
const api = useAPI()
const { toast } = useToast()

const name = ref(user.value!.name)
const nameRef = ref<HTMLIonInputElement>()

function changeName() {
  api.changeUserName({
    _id: user.value!._id,
    name: name.value
  })
  user.value!.name = name.value
  toast('Changed name')
}

function onNameBlur() {
  if (name.value != '' && name.value != user.value?.name) changeName()
  else name.value = user.value!.name
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

EventBus.on('reset-name', () => name.value = user.value!.name) // TODO sketchy, remove this


</script>

<style scoped>

</style>