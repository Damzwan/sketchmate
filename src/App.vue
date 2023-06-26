<template>
  <ion-app>
    <CircularLoader class="z-10" v-if="!isPlatform('capacitor') && !isRouterReady" />
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet, isPlatform } from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { defineCustomElements } from '@ionic/pwa-elements/loader'
import CircularLoader from '@/components/loaders/CircularLoader.vue'
import router from '@/router'

const isRouterReady = ref(false)
router.isReady().then(() => (isRouterReady.value = true))

onMounted(async () => {
  defineCustomElements(window)
})
</script>

<style lang="scss">
ion-content {
  --background: var(--ion-color-background);
}
</style>
