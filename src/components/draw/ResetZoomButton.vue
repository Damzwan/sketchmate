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
import { IonButton, IonIcon } from "@ionic/vue";
import { mdiMagnifyMinusOutline } from "@mdi/js";
import { storeToRefs } from "pinia";
import { resetZoom } from "@/draw/canvas/viewport";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import { svg } from "@/helper/general.helper";

const { canResetView } = storeToRefs(useDrawUIStore());
</script>

<style scoped>

</style>
