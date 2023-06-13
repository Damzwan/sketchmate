<template>
  <ion-app>
    <CircularLoader v-if="!canProceed" />
    <transition>
      <ion-router-outlet v-show="canProceed" />
    </transition>
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { useSocketService } from '@/service/api/socket.service'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { defineCustomElements } from '@ionic/pwa-elements/loader'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import { addNotificationListeners } from '@/helper/notification.helper'
import router from '@/router'
import CircularLoader from '@/components/loaders/CircularLoader.vue'

const socketService = useSocketService()
const { isLoggedIn } = storeToRefs(useAppStore())

const routerReady = ref(false)
const canProceed = computed(() => isLoggedIn.value && routerReady.value)

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

<style scoped>
.v-enter-active,
.v-leave-active {
  transition: opacity 0.5s;
}

.v-enter-from,
.v-leave-to {
  opacity: 60%;
}
</style>
