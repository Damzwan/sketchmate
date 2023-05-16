<template>
  <ion-app>
    <FullScreenLoader v-if="!isLoggedIn || !routerReady" />
    <ion-router-outlet v-else />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { useSocketService } from '@/service/socket.service'
import { onMounted, onUnmounted, ref } from 'vue'
import { defineCustomElements } from '@ionic/pwa-elements/loader'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import { addNotificationListeners } from '@/helper/notification.helper'
import FullScreenLoader from '@/components/loaders/CircularLoader.vue'
import router from '@/router'

const socketService = useSocketService()
const { isLoggedIn } = storeToRefs(useAppStore())

const routerReady = ref(false)

router.isReady().then(() => (routerReady.value = true))

// socketService.provideRouter(useIonRouter())
addNotificationListeners()

onMounted(() => {
  defineCustomElements(window)
})

onUnmounted(() => {
  socketService.disconnect()
})
</script>

<style lang="scss">
ion-content {
  --background: var(--ion-color-background);
}
</style>
