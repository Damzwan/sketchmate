<template>
  <ion-popover trigger="text_options">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" @click="selectAction(DrawAction.ChangeFontWeight)">
          <ion-icon :icon="svg(mdiFormatBold)" />
          <p class="pl-2 text-base">Bold</p>
        </ion-item>
        <ion-item color="tertiary" :button="true" @click="selectAction(DrawAction.ChangeFontStyle)">
          <ion-icon :icon="svg(mdiFormatItalic)" />
          <p class="pl-2 text-base">Italic</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="selectAction(DrawAction.ChangeTextAlign)">
          <ion-icon :icon="svg(mdiFormatAlignCenter)" />
          <p class="pl-2 text-base">Center text</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="selectAction(DrawAction.CurveText)">
          <ion-icon :icon="svg(mdiVectorCurve)" />
          <p class="pl-2 text-base">Curve</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import { mdiFormatAlignCenter, mdiFormatBold, mdiFormatItalic, mdiVectorCurve } from '@mdi/js'
import { IonContent, IonIcon, IonItem, IonList, IonPopover } from '@ionic/vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawAction } from '@/types/draw.types'

const { selectAction } = useDrawStore()
</script>

<style scoped></style>
