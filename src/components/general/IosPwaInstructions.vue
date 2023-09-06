<template>
  <ion-modal :trigger="trigger" :breakpoints="[0, 0.4]" :initial-breakpoint="0.4" :handle="false">
    <ion-header>
      <ion-toolbar color="tertiary">
        <ion-title>Install SketchMate</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="p-5">
        Install the app on your device to easily access it anytime

        <ol class="list-decimal pl-5 pt-5">
          <li>
            Tap on
            <ion-icon :icon="svg(mdiExportVariant)" class="align-middle mb-2.5" />
          </li>
          <li>Select "Add to Home Screen"</li>
        </ol>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script lang="ts" setup>
import { IonIcon, IonModal, IonContent, IonToolbar, IonHeader } from '@ionic/vue'
import { svg } from '@/helper/general.helper'
import { mdiExportVariant } from '@mdi/js'

defineProps<{
  trigger: string
}>()
</script>

<style scoped>
ion-icon {
  @apply w-[40px] h-[40px];
}
</style>
