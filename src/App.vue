<template>
  <ion-app>
    <CircularLoader class="z-50" v-if="!isRouterReady || isAuthLoading" bg-color="bg-background" />
    <ForceUpdateModal v-if="isNative() && showForceUpdateModal" />
    <FeedbackMenu />
    <DateOfBirthConfirmation />
    <DrawMenus />
    <DrawModal />
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, useIonRouter } from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { defineCustomElements } from '@ionic/pwa-elements/loader'
import { isNative, setupBackButtonBehavior, setupPWAPromptListener, setupReadyWatcher } from '@/helper/general.helper'
import { storeToRefs } from 'pinia'
import ForceUpdateModal from '@/components/general/ForceUpdateModal.vue'
import CircularLoader from '@/components/general/loaders/CircularLoader.vue'
import DateOfBirthConfirmation from '@/components/general/DateOfBirthConfirmation.vue'
import FeedbackMenu from '@/components/general/FeedbackMenu.vue'
import { useNetworkStore } from '@/store/network.store'
import { useAuthStore } from '@/store/auth.store'
import DrawMenus from '@/components/draw/menus/DrawMenus.vue'
import DrawModal from '@/components/draw/DrawModal.vue'

const ionRouter = useIonRouter()
const { initIonRouter } = useAuthStore()
initIonRouter(ionRouter)

const {
  isAuthLoading,
  showForceUpdateModal
} = storeToRefs(useAuthStore())
const networkStore = useNetworkStore()

const isRouterReady = ref(false)

onMounted(async () => {
  defineCustomElements(window)  // this timeout is necessary to avoid flickering in the beginning (should not be there)
})


setupReadyWatcher(isRouterReady, isAuthLoading)
setupBackButtonBehavior()
setupPWAPromptListener()
networkStore.init()

</script>

<style lang="scss">
ion-content {
  --background: var(--ion-color-background);
}


</style>
