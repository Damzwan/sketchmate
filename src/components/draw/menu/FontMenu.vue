<template>
  <ion-popover trigger="font" @didDismiss="onDismiss">
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
import { useDrawStore } from '@/store/draw/draw.store'
import { focusText } from '@/helper/draw/draw.helper'
import { storeToRefs } from 'pinia'
import { useSelect } from '@/service/draw/tools/select.tool'
import { IText } from 'fabric/fabric-impl'
import { computed } from 'vue'

const { selectedObjectsRef } = storeToRefs(useSelect())
const text = computed(() => selectedObjectsRef.value[0] as IText)
const emits = defineEmits(['font_selected'])

function selectFont(font: string) {
  emits('font_selected', font)
}

function onDismiss() {
  const { isEditingText } = useDrawStore()
  if (text.value.text == '' || isEditingText) focusText(text.value)
}
</script>

<style scoped></style>
