<template>
  <ion-popover trigger="font">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" v-for="font in FONTS" :key="font" @click="selectFont(font)">
          <p class="pl-2 text-base" :style="{ fontFamily: font }">{{ font }}</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonContent, IonItem, IonList, IonPopover } from '@ionic/vue'
import { FONTS } from '@/config/draw.config'

const emits = defineEmits(['font_selected'])

function selectFont(font: string) {
  emits('font_selected', font)
}
</script>

<style scoped></style>
