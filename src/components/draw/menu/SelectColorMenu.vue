<template>
  <ion-popover :trigger="trigger" @didDismiss="onDismiss" :showBackdrop="false" @willPresent="onPresent">
    <ion-content class="divide-y divide-primary">
      <div class="px-2 pt-1">
        <label for="slider">Stroke Width: {{ strokeWidth }}</label>
        <ion-range
          id="slider"
          :value="strokeWidth"
          @ionChange="(e: any) => emits('update:strokeWidth', e.detail.value)"
          min="2"
          max="50"
          color="secondary"
        />
      </div>
      <ion-list lines="none" class="p-0 divide-y divide-primary">
        <ion-item color="tertiary" :button="true" id="stroke">
          <ion-icon :icon="svg(mdiBorderColor)" />
          <p class="pl-2 text-base">Stroke Color</p>
          <div
            slot="end"
            v-show="strokeColor && hexWithTransparencyToNormal(strokeColor) !== BLACK"
            class="flex items-center -mr-2"
          >
            <div class="rounded-full w-[26px] h-[26px]" :style="{ backgroundColor: strokeColor }" />
            <ion-icon
              v-if="disableClear !== 'stroke'"
              class="w-[32px] h-[32px]"
              :icon="svg(mdiClose)"
              color="danger"
              @click="() => emits('update:stroke-color', undefined)"
              @click.stop
            />
          </div>

          <ion-popover trigger="stroke" side="left">
            <ColorPicker
              :color="strokeColor || BLACK"
              @update:color="c => emits('update:stroke-color', c)"
              :show-opacity="true"
              :color-picker-action="DrawAction.ChangeStrokeColour"
            />
          </ion-popover>
        </ion-item>

        <ion-item color="tertiary" :button="true" id="fill">
          <ion-icon :icon="svg(mdiFormatColorFill)" />
          <p class="pl-2 text-base">Fill Color</p>
          <div slot="end" v-show="fillColor" class="flex items-center -mr-2">
            <div class="rounded-full w-[26px] h-[26px]" :style="{ backgroundColor: fillColor }" v-if="fillColor" />
            <ion-icon
              class="w-[32px] h-[32px]"
              :icon="svg(mdiClose)"
              color="danger"
              @click="() => emits('update:fill-color', undefined)"
              @click.stop
            />
          </div>

          <ion-popover trigger="fill" side="left">
            <ColorPicker
              :color="fillColor"
              @update:color="c => emits('update:fill-color', c)"
              :show-opacity="true"
              :color-picker-action="DrawAction.ChangeFillColour"
            />
          </ion-popover>
        </ion-item>

        <ion-item color="tertiary" :button="true" id="background">
          <ion-icon :icon="svg(mdiPanoramaHorizontalOutline)" />
          <p class="pl-2 text-base">Background Color</p>

          <div slot="end" v-show="backgroundColor" class="flex items-center -mr-2">
            <div
              class="rounded-full w-[26px] h-[26px]"
              :style="{ backgroundColor: backgroundColor }"
              v-if="backgroundColor"
            />
            <ion-icon
              class="w-[32px] h-[32px]"
              :icon="svg(mdiClose)"
              color="danger"
              @click="() => emits('update:background-color', undefined)"
              @click.stop
            />
          </div>

          <ion-popover trigger="background" side="left">
            <ColorPicker
              :color="backgroundColor || BLACK"
              @update:color="c => emits('update:background-color', c)"
              :show-opacity="true"
              :color-picker-action="DrawAction.ChangeBackgroundColor"
            />
          </ion-popover>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import { mdiBorderColor, mdiClose, mdiFormatColorFill, mdiPanoramaHorizontalOutline } from '@mdi/js'
import { IonContent, IonIcon, IonItem, IonList, IonPopover, IonRange } from '@ionic/vue'
import { ref } from 'vue'
import { BLACK } from '@/config/draw/draw.config'
import { focusText, hexWithTransparencyToNormal, isText } from '@/helper/draw/draw.helper'
import { useSelect } from '@/service/draw/tools/select.tool'
import { IText } from 'fabric/fabric-impl'
import ColorPicker from '@/components/draw/ColorPicker.vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawAction } from '@/types/draw.types'

defineProps<{
  trigger: string
  strokeColor?: string
  fillColor?: string
  backgroundColor?: string
  disableClear?: 'stroke' | 'fill'
  strokeWidth: number
}>()

const shouldRefocusTextAfterClose = ref(false)

const emits = defineEmits<{
  (e: 'update:stroke-color', color: string | undefined): void
  (e: 'update:fill-color', color: string | undefined): void
  (e: 'update:background-color', color: string | undefined): void
  (e: 'update:strokeWidth', strokeWidth: number): void
}>()

function onDismiss() {
  const { selectedObjectsRef } = useSelect()
  if (!isText(selectedObjectsRef)) return
  if (shouldRefocusTextAfterClose.value) focusText(selectedObjectsRef[0] as IText)
  shouldRefocusTextAfterClose.value = false
}

function onPresent() {
  const { selectedObjectsRef } = useSelect()
  if (!isText(selectedObjectsRef)) return

  const { getCanvas, isEditingText } = useDrawStore()
  if (isEditingText) {
    shouldRefocusTextAfterClose.value = true
    if ((selectedObjectsRef[0] as IText).text != '') getCanvas().discardActiveObject() // TODO needed to activate history
  }
}
</script>

<style scoped></style>
