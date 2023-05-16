<template>
  <ion-content>
    <div class="flex justify-center items-center w-full h-4/5">
      <div>
        <div class="flex flex-col text-center">
          <img :src="noMessagesImg" alt="No messages" class="h-[200px] aspect-square" />
          <div class="text-md py-3">No messages have been received yet...</div>
        </div>

        <div class="flex w-full justify-center items-center">
          <ion-button mode="ios" fill="outline" color="secondary" :router-link="FRONTEND_ROUTES.draw"
            >Start drawing</ion-button
          >
        </div>
      </div>
    </div>
  </ion-content>
</template>

<script lang="ts" setup>
import { IonButton, IonContent } from '@ionic/vue'
import noMessagesImg from '@/assets/illustrations/no-messages.svg'
import { FRONTEND_ROUTES } from '@/types/router.types'
</script>

<style scoped></style>
