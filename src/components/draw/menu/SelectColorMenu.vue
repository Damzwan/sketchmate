<template>
  <ion-popover trigger="select_color" @didDismiss="onDismiss" :showBackdrop="false">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" id="stroke">
          <ion-icon :icon="svg(mdiBorderColor)" />
          <p class="pl-2 text-base">Stroke Colour</p>

          <ion-popover trigger="stroke" side="right">
            <ColorPicker v-model:color="strokeColor" @update:color="emits('update:stroke-color', strokeColor)" />
          </ion-popover>
        </ion-item>

        <ion-item color="tertiary" :button="true" id="fill">
          <ion-icon :icon="svg(mdiFormatColorFill)" />
          <p class="pl-2 text-base">Fill Colour</p>

          <ion-popover trigger="fill" side="right">
            <ColorPicker v-model:color="fillColor" @update:color="emits('update:fill-color', fillColor)" />
          </ion-popover>
        </ion-item>

        <ion-item color="tertiary" :button="true" id="background">
          <ion-icon :icon="svg(mdiPanoramaHorizontalOutline)" />
          <p class="pl-2 text-base">Background Colour</p>

          <ion-popover trigger="background" side="right">
            <ColorPicker
              v-model:color="backgroundColor"
              @update:color="emits('update:background-color', backgroundColor)"
            />
          </ion-popover>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import { mdiBorderColor, mdiFormatColorFill, mdiPanoramaHorizontalOutline } from '@mdi/js'
import { IonContent, IonIcon, IonItem, IonList, IonPopover } from '@ionic/vue'
import { ref } from 'vue'
import { BLACK } from '@/config/draw/draw.config'
import { focusText, isText } from '@/helper/draw/draw.helper'
import { useSelect } from '@/service/draw/tools/select.tool'
import { IText } from 'fabric/fabric-impl'
import ColorPicker from '@/components/draw/ColorPicker.vue'

const strokeColor = ref<string>(BLACK)
const fillColor = ref<string>(BLACK)
const backgroundColor = ref<string>(BLACK)

const emits = defineEmits<{
  (e: 'update:stroke-color', color: string): void
  (e: 'update:fill-color', color: string): void
  (e: 'update:background-color', color: string): void
}>()

function onDismiss() {
  const { selectedObjectsRef } = useSelect()
  if (isText(selectedObjectsRef)) {
    const text = selectedObjectsRef[0] as IText
    if (text.text == '') focusText(text)
  }
}
</script>

<style scoped></style>
