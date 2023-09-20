<template>
  <ion-page>
    <transition name="list">
      <IntroPage v-if="localUserId === ''" class="z-10 absolute" />
    </transition>
    <ConnectPage />
  </ion-page>
</template>

<script setup lang="ts">
import { useAppStore } from '@/store/app.store'
import ConnectPage from '@/components/connect/ConnectPage.vue'
import IntroPage from '@/components/connect/IntroPage.vue'
import { IonPage, onIonViewDidEnter } from '@ionic/vue'
import { NotificationType } from '@/types/server.types'
import { storeToRefs } from 'pinia'

const appStore = useAppStore()
const { localUserId } = storeToRefs(appStore)

onIonViewDidEnter(() => {
  appStore.consumeNotificationLoading(NotificationType.unmatch)
})
</script>

<style lang="scss" scoped>
.list-enter-active,
.list-leave-active {
  transition: all 0.5s ease;
}
.list-enter-from,
.list-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>
