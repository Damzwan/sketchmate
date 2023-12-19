<template>
  <ion-app>
    <CircularLoader class="z-50" v-if="!isRouterReady" />

    <UpdatePage v-if="shouldUpdateApp" class="z-50" />
    <OfflinePage
      class="z-50"
      v-if="networkStatus && !networkStatus.connected && route.path != `/${FRONTEND_ROUTES.draw}`"
    />

    <ConfirmationAlert header="Enjoying SketchMate?"
                       message="Support the solo developer behind SketchMate! Rate the app if you enjoy it."
                       v-model:isOpen="reviewAppAlertOpen" confirmationtext="Rate" @confirm="openPlayStoreLink" />
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
import OfflinePage from '@/components/general/OfflinePage.vue'
import { useRoute } from 'vue-router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { useToast } from '@/service/toast.service'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import { app_store_link } from '@/config/general.config'
import { LocalStorage } from '@/types/storage.types'
import { Preferences } from '@capacitor/preferences'
import { AppUpdate } from '@capawesome/capacitor-app-update'
import UpdatePage from '@/components/general/UpdatePage.vue'

const ionRouter = useIonRouter()
const { networkStatus, userDeletedError, reviewAppAlertOpen } = storeToRefs(useAppStore())
const route = useRoute()
const { isOpen, dismiss } = useToast()
const shouldUpdateApp = ref(false)
if (isNative()) AppUpdate.getAppUpdateInfo().then(res => shouldUpdateApp.value = res.availableVersion == '98')

function openPlayStoreLink() {
  window.open(app_store_link)
  Preferences.set({ key: LocalStorage.reviewPromptCount, value: '0' })
}


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

useBackButton(10, processNextHandler => {
  if (isOpen.value) dismiss()
  else processNextHandler()
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
