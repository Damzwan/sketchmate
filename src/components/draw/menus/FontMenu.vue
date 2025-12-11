<template>
  <ion-popover trigger="font" @willDismiss="onDismiss" @willPresent="onPresent" :showBackdrop="false"
               :is-open="fontMenuOpen" :event="menuEvent">
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
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useMenuStore } from '@/store/menu.store'
import { useSelect } from '@/draw/store/tools/select.store'
import { DrawAction } from '@/draw/types/draw.types'
import { IText } from 'fabric'
import { focusText } from '@/draw/helpers/text.helper'
import { FONTS } from '@/draw/config/fonts.config'

const { selectedObjectsRef } = storeToRefs(useSelect())
const text = computed(() => selectedObjectsRef.value[0] as IText)

const shouldRefocusTextAfterClose = ref(false)

const { fontMenuOpen, menuEvent } = storeToRefs(useMenuStore())

function selectFont(font: string) {
  const { selectAction } = useDrawStore()
  selectAction(DrawAction.ChangeFont, { font })
}

function onPresent() {
  const { getCanvas } = useDrawStore()
  const { isEditingText } = useSelect()
  if (isEditingText) {
    shouldRefocusTextAfterClose.value = true
    if (text.value.text != '') getCanvas().discardActiveObject() // TODO needed to activate history
  }
}

function onDismiss() {
  if (shouldRefocusTextAfterClose.value) focusText(text.value)
  shouldRefocusTextAfterClose.value = false
  fontMenuOpen.value = false
}
</script>

<style scoped>
/*Fonts*/
@import url('https://fonts.googleapis.com/css2?family=Indie+Flower&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Anton&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Rubik+Puddles&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Chokokutai&family=Rubik+Puddles&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Chokokutai&family=Dancing+Script&family=Rubik+Puddles&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Amatic+SC&family=Chokokutai&family=Dancing+Script&family=Rubik+Puddles&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Amatic+SC&family=Chokokutai&family=Dancing+Script&family=Krub&family=Rubik+Puddles&display=swap');

ion-list {
  padding: 0;
}
</style>