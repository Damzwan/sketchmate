<template>
  <div class="flex justify-center h-full items-center bg-background flex-col">
    <ion-spinner color="primary" />
    <p class="text-lg pt-3">{{ text }}</p>
  </div>
</template>

<script lang="ts" setup>
import { IonSpinner } from '@ionic/vue'

defineProps<{
  text?: string
}>()
</script>

<style scoped>
ion-spinner {
  width: 50px;
  height: 50px;
}
</style>
