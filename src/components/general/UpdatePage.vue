<template>
  <div class="w-full h-full bg-background">
    <div class="w-full h-4/5 flex justify-center items-center">
      <div class="flex justify-center items-center flex-col">
        <img :src="offline" alt="offline image" class="h-[350px] aspect-square" />
        <div class="text-2xl text-black text-center">Update SketchMate!</div>
        <div class="text-base text-black pt-1 text-center px-2">SketchMate now supports connecting to multiple mates!
          Please update the
          app to continue using SketchMate
        </div>

        <div class="flex w-full justify-center items-center pt-5">
          <ion-button mode="ios" fill="outline" color="secondary" @click="update">Update</ion-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import offline from '@/assets/illustrations/offline.svg'
import { IonButton } from '@ionic/vue'
import { isNative } from '@/helper/general.helper'
import { AppUpdate, AppUpdateAvailability } from '@capawesome/capacitor-app-update'
import { App } from '@capacitor/app'

async function update() {
  if (isNative()) {
    const result = await AppUpdate.getAppUpdateInfo()
    if (result.updateAvailability !== AppUpdateAvailability.UPDATE_AVAILABLE) {
      return
    }
    if (result.immediateUpdateAllowed) {
      await AppUpdate.performImmediateUpdate()
      await App.exitApp()
    }
  } else location.reload()
}
</script>

<style scoped></style>
