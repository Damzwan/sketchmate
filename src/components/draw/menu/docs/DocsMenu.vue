<template>
  <ion-modal
    trigger="docs"
    @willDismiss="setAppColors(colorsPerRoute[FRONTEND_ROUTES.draw])"
    @willPresent="setAppColors(settingsModalColorConfig)"
  >
    <ion-nav :root="MainPage" ref="nav" :swipeGesture="true" />
  </ion-modal>
</template>

<script lang="ts" setup>
import { IonModal, IonNav } from '@ionic/vue'
import { isNative, setAppColors } from '@/helper/general.helper'
import { colorsPerRoute, settingsModalColorConfig } from '@/config/colors.config'
import { FRONTEND_ROUTES } from '@/types/router.types'
import MainPage from '@/components/draw/menu/docs/MainDocsPage.vue'
import { ref } from 'vue'

const nav = ref<any>()

// async function canDismiss() {
//   const canGoBack = await nav.value.$el.canGoBack()
//   return !isNative() || !canGoBack
// }
</script>

<style scoped></style>
