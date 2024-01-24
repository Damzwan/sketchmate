<template>
  <div class="bg-background w-full h-full absolute z-50">
    <div class="w-full h-full flex-col flex justify-center">
      <img :src="settingsImg" alt="No messages" class="w-full h-[300px]" />
      <div class="w-full flex flex-col justify-center items-center">
        <h1 class="text-2xl font-bold text-black">Update required</h1>
        <p class="px-5 text-center text-lg text-black">SketchMate changed a lot, please update the app to continue using
          SketchMate.</p>
        <ion-button color="secondary" class="pt-2" expand="full" @click="onBtnClick"
        >Update App
        </ion-button
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import settingsImg from '@/assets/illustrations/settings.svg'

import { IonButton } from '@ionic/vue'
import { AppUpdate } from '@capawesome/capacitor-app-update'
import { onMounted } from 'vue'
import { setAppColors } from '@/helper/general.helper'
import { settingsModalColorConfig } from '@/config/colors.config'
import { App } from '@capacitor/app'

async function onBtnClick(){
  await AppUpdate.openAppStore()
  await App.exitApp()
}

onMounted(() => {
  setTimeout(() => setAppColors(settingsModalColorConfig), 300)
})
</script>

<style scoped>

</style>