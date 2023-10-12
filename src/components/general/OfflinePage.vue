<template>
  <div class="w-full h-full bg-background">
    <div class="w-full h-4/5 flex justify-center items-center">
      <div class="flex justify-center items-center flex-col">
        <img :src="offline" alt="offline image" class="h-[350px] aspect-square" />
        <div class="text-2xl text-black text-center">You are offline</div>
        <div class="text-base text-black pt-1 text-center">Connect to the internet and try again</div>

        <div class="flex w-full justify-center items-center pt-5">
          <ion-button mode="ios" fill="outline" color="secondary" @click="reload">Refresh</ion-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import offline from '@/assets/illustrations/offline.svg'
import { IonButton } from '@ionic/vue'

function reload() {
  location.reload()
}
</script>

<style scoped></style>
