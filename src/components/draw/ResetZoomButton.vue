<template>
  <div class="flex justify-center items-center absolute bottom-4 w-full">
    <div id="clickOutside" />
    <ion-button v-if="canResetView" @click="resetZoom" color="secondary" shape="round">
      <ion-icon slot="start" :icon="svg(mdiMagnifyMinusOutline)" />
      Reset view
    </ion-button>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { mdiMagnifyMinusOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { resetZoom } from '@/draw/helpers/viewport.helper'
import { useDrawStore } from '@/draw/store/draw.store'


const { canResetView } = storeToRefs(useDrawStore())

</script>

<style scoped>

</style>