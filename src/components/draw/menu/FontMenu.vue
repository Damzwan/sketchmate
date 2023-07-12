<template>
  <ion-popover trigger="font" @willDismiss="onDismiss" @willPresent="onPresent">
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
import { computed, ref } from 'vue'

const { selectedObjectsRef } = storeToRefs(useSelect())
const text = computed(() => selectedObjectsRef.value[0] as IText)
const emits = defineEmits(['font_selected'])

const shouldRefocusTextAfterClose = ref(false)

function selectFont(font: string) {
  emits('font_selected', font)
}

function onPresent() {
  const { getCanvas, isEditingText } = useDrawStore()
  if (text.value.text == '' || isEditingText) {
    shouldRefocusTextAfterClose.value = true
    getCanvas().discardActiveObject()
  }
}

function onDismiss() {
  if (shouldRefocusTextAfterClose.value) focusText(text.value)
  shouldRefocusTextAfterClose.value = false
}
</script>

<style scoped></style>
