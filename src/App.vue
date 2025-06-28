<template>
  <ion-app>
    <CircularLoader class="z-50" v-if="!isRouterReady || isAuthLoading" />


    <OfflinePage
      class="z-50"
      v-if="networkStatus && !networkStatus.connected && route.path != `/${FRONTEND_ROUTES.draw}`"
    />
    <ForceUpdateModal v-if="isNative() && showForceUpdateModal" />

    <FeedbackMenu />

    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, useBackButton, useIonRouter } from '@ionic/vue'
import { onMounted, ref, watch } from 'vue'
import { defineCustomElements } from '@ionic/pwa-elements/loader'
import CircularLoader from "@/components/general/loaders/CircularLoader.vue"
import router from '@/router'
import { hideLoading, isNative } from '@/helper/general.helper'
import { App } from '@capacitor/app'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import OfflinePage from '@/components/general/OfflinePage.vue'
import { useRoute } from 'vue-router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { useToast } from '@/service/toast.service'
import ForceUpdateModal from '@/components/general/ForceUpdateModal.vue'
import FeedbackMenu from '@/components/draw/menu/FeedbackMenu.vue'

const ionRouter = useIonRouter()
const { initIonRouter } = useAuthStore()
initIonRouter(ionRouter)
const {
  networkStatus,
  isAuthLoading,
  showForceUpdateModal
} = storeToRefs(useAuthStore())


const route = useRoute()
const { isOpen, dismiss } = useToast()


const isRouterReady = ref(false)
router.isReady().then(() => {
  isRouterReady.value = true
})

if (isNative()) {
  watch([isAuthLoading, isRouterReady], () => {
    if (!isAuthLoading.value && isRouterReady.value) hideLoading()
  })
}

onMounted(async () => {
  // this timeout is necessary to avoid flickering in the beginning (should not be there)
  defineCustomElements(window)
})

useBackButton(-1, () => {
  if (!ionRouter.canGoBack()) {
    App.exitApp()
  }
})

useBackButton(10, processNextHandler => {
  if (isOpen.value) dismiss()
  else processNextHandler()
})

if (!isNative()) {
  window.addEventListener('beforeinstallprompt', e => {
    const { installPrompt } = storeToRefs(useAuthStore())
    installPrompt.value = e
    if (window.matchMedia('(display-mode: standalone)').matches) {
      installPrompt.value = undefined
    }
  })
}
</script>

<style lang="scss">
ion-content {
  --background: var(--ion-color-background);
}
</style>
