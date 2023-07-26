<template>
  <ion-page id="page">
    <SettingsHeader title="My Mate" :presenting-element="page" />
    <ion-content>
      <div class="h-full flex flex-col">
        <div class="w-full h-full flex justify-center items-center">
          <div class="w-full">
            <div class="text-4xl font-bold text-center">You are mates!</div>

            <div class="py-5">
              <div class="illustration-container" v-if="user?.mate">
                <ion-avatar class="left-img">
                  <img :src="user?.img" class="aspect-square w-[50px]" alt="Profile picture" />
                </ion-avatar>
                <ion-avatar class="right-img">
                  <img :src="user?.mate.img" class="aspect-square w-[50px]" alt="Mate profiel picture" />
                </ion-avatar>
                <img :src="matchImage" class="h-48" alt="Match iamge" />
              </div>

              <div class="w-full flex justify-center items-center py-2">
                <div class="text-lg w-3/4 text-center"> Get ready to doodle with {{ user?.mate?.name }}</div>
              </div>
            </div>

            <div class="flex justify-center items-center py-3 w-full">
              <ion-button
                @click="() => router.push(FRONTEND_ROUTES.draw)"
                color="secondary"
                class="w-9/12 h-10 max-w-md"
                mode="ios"
              >
                Start drawing
              </ion-button>
            </div>

            <div class="flex justify-center items-center">
              <ion-button
                :disabled="!user"
                @click="unMatch"
                color="danger"
                fill="outline"
                class="w-9/12 h-10 max-w-md rounded-full"
                mode="ios"
              >
                Unmatch
              </ion-button>
            </div>
          </div>
        </div>
        <SettingLinks class="pb-2" :blog="false" :contact="false" />
      </div>
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import { IonAvatar, IonButton, IonContent, IonPage, onIonViewDidEnter } from '@ionic/vue'

import { useAppStore } from '@/store/app.store'
import { storeToRefs } from 'pinia'
import { useSocketService } from '@/service/api/socket.service'
import matchImage from '@/assets/illustrations/match.svg'
import { FRONTEND_ROUTES } from '@/types/router.types'
import SettingsHeader from '@/components/settings/SettingsHeader.vue'
import router from '@/router'
import { onMounted, ref } from 'vue'
import { NotificationType } from '@/types/server.types'
import { setAppColors } from '@/helper/general.helper'
import { colorsPerRoute } from '@/config/colors.config'
import SettingLinks from '@/components/settings/SettingLinks.vue'

const appStore = useAppStore()
const { user } = storeToRefs(appStore)
const socketService = useSocketService()

const page = ref()

onIonViewDidEnter(() => {
  appStore.consumeNotificationLoading(NotificationType.match)
})

onMounted(() => {
  page.value = document.getElementById('page')
})

function unMatch() {
  socketService.unMatch({
    _id: user.value!._id,
    mate_id: user.value!.mate!._id,
    name: user.value!.name
  })
}
</script>

<style scoped>
.illustration-container {
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
}

.left-img,
.right-img {
  position: absolute;
  z-index: 2;
}

.left-img {
  left: calc(50% - 52px);
  top: calc(50% - 75px);
}

.right-img {
  top: calc(50% - 75px);
  left: calc(50% + 30px); /* Adjust the value to position the right image on the illustration */
}
</style>
