<template>
  <ion-app>
    <CircularLoader class="z-10" v-if="!routerReady" />
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { onMounted, ref } from 'vue'
import { defineCustomElements } from '@ionic/pwa-elements/loader'
import router from '@/router'
import CircularLoader from '@/components/loaders/CircularLoader.vue'

const routerReady = ref(false)

router.isReady().then(() => {
  routerReady.value = true
})

onMounted(async () => {
  defineCustomElements(window)
})
</script>

<style lang="scss">
ion-content {
  --background: var(--ion-color-background);
}
</style>

<style scoped></style>
