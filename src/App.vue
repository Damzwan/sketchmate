<template>
  <ion-app>
    <CircularLoader class="z-50" v-if="!isRouterReady" />
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, useBackButton, useIonRouter } from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { defineCustomElements } from '@ionic/pwa-elements/loader'
import CircularLoader from '@/components/loaders/CircularLoader.vue'
import router from '@/router'
import { hideLoading, isNative } from '@/helper/general.helper'
import { App } from '@capacitor/app'
import { useAppStore } from '@/store/app.store'
import { storeToRefs } from 'pinia'

const ionRouter = useIonRouter()

const isRouterReady = ref(false)
router.isReady().then(() => {
  isRouterReady.value = true
  if (isNative()) hideLoading()
})

onMounted(async () => {
  // this timeout is necessary to avoid flickering in the beginning (should not be there)
  defineCustomElements(window)
})

useBackButton(-1, () => {
  if (!ionRouter.canGoBack()) {
    App.exitApp()
  }
})

if (!isNative()) {
  window.addEventListener('beforeinstallprompt', e => {
    const { installPrompt } = storeToRefs(useAppStore())
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
