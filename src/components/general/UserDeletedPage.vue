<template>
  <div class="w-full h-full bg-background">
    <div class="w-full h-4/5 flex justify-center items-center">
      <div class="flex justify-center items-center flex-col">
        <img :src="offline" alt="offline image" class="h-[350px] aspect-square" />
        <div class="text-3xl text-black">Your account has been deleted</div>
        <div class="text-base text-black pt-1"
          >Sorry for the inconvenience, I work on this alone and sometimes I make mistakes :(
        </div>

        <div class="flex w-full justify-center items-center pt-5">
          <ion-button mode="ios" fill="outline" color="secondary" @click="removeLocalAccount"
            >Create new account</ion-button
          >
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import offline from '@/assets/illustrations/offline.svg'
import { IonButton } from '@ionic/vue'
import { Preferences } from '@capacitor/preferences'
import { LocalStorage } from '@/types/storage.types'

async function removeLocalAccount() {
  await Promise.any([
    Preferences.remove({ key: LocalStorage.img }),
    Preferences.remove({ key: LocalStorage.user }),
    Preferences.remove({ key: LocalStorage.mate })
  ])
  location.reload()
}
</script>

<style scoped></style>
