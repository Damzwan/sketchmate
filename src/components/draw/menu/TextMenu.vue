<template>
  <ion-popover trigger="text_options" @willDismiss="onDismiss" @willPresent="onPresent" :showBackdrop="false">
    <ion-content v-if="text">
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary">
          <div class="flex justify-between w-full">
            <div class="button_group">
              <div
                :class="{ 'bg-primary-shade': isBold }"
                @click="selectAction(DrawAction.ChangeFontWeight, { weight: isBold ? 'normal' : 'bold' })"
              >
                <ion-icon :icon="svg(mdiFormatBold)" />
              </div>

              <div
                :class="{ 'bg-primary-shade': isItalic }"
                @click="selectAction(DrawAction.ChangeFontStyle, { style: isItalic ? 'normal' : 'italic' })"
              >
                <ion-icon :icon="svg(mdiFormatItalic)" />
              </div>

              <div :class="{ 'bg-primary-shade': isCurved }" @click="selectAction(DrawAction.CurveText)">
                <ion-icon :icon="svg(mdiVectorCurve)" />
              </div>
            </div>

            <div class="button_group">
              <div
                :class="{ 'bg-primary-shade': align === TextAlign.left }"
                @click="selectAction(DrawAction.ChangeTextAlign, { align: TextAlign.left })"
              >
                <ion-icon :icon="svg(mdiFormatAlignLeft)" />
              </div>

              <div
                :class="{ 'bg-primary-shade': align === TextAlign.center }"
                @click="selectAction(DrawAction.ChangeTextAlign, { align: TextAlign.center })"
              >
                <ion-icon :icon="svg(mdiFormatAlignCenter)" />
              </div>

              <div
                :class="{ 'bg-primary-shade': align === TextAlign.right }"
                @click="selectAction(DrawAction.ChangeTextAlign, { align: TextAlign.right })"
              >
                <ion-icon :icon="svg(mdiFormatAlignRight)" />
              </div>
            </div>
          </div>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import {
  mdiFormatAlignCenter,
  mdiFormatAlignLeft,
  mdiFormatAlignRight,
  mdiFormatBold,
  mdiFormatItalic,
  mdiVectorCurve
} from '@mdi/js'
import { IonContent, IonIcon, IonItem, IonList, IonPopover } from '@ionic/vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawAction, TextAlign } from '@/types/draw.types'
import { useSelect } from '@/service/draw/tools/select.tool'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { IText } from 'fabric/fabric-impl'
import { focusText } from '@/helper/draw/draw.helper'

const { selectAction } = useDrawStore()
const { selectedObjectsRef } = storeToRefs(useSelect())
const text = computed(() => selectedObjectsRef.value[0] as IText)

const isBold = computed(() => text.value.fontWeight === 'bold')

const isItalic = computed(() => text.value.fontStyle === 'italic')
const align = computed(() => text.value.textAlign)
const isCurved = computed(() => text.value.isCurved)

const shouldRefocusTextAfterClose = ref(false)

function onDismiss() {
  if (shouldRefocusTextAfterClose.value) focusText(text.value)
  shouldRefocusTextAfterClose.value = false
}

function onPresent() {
  const { getCanvas, isEditingText } = useDrawStore()
  if (isEditingText) {
    shouldRefocusTextAfterClose.value = true
    if (text.value.text != '') getCanvas().discardActiveObject() // TODO needed to activate history
  }
}
</script>

<style scoped>
.button_group {
  @apply flex h-10 divide-x divide-black border border-black rounded-xl overflow-hidden bg-primary;
}

.button_group div {
  @apply w-10 h-10 flex justify-center items-center  cursor-pointer;
}

.button_group div ion-icon {
  @apply w-6 h-6;
}

ion-popover {
  --width: 300px; /* Set this to the desired width */
}
</style>
