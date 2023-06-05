<template>
  <ion-toolbar color="primary" class="h-[46px]">
    <ion-buttons slot="start">
      <ion-button @click="setSelectedObjects([])">
        <ion-icon slot="icon-only" :icon="svg(mdiClose)"></ion-icon>
      </ion-button>

      <ion-button id="select_color" v-if="!containsImage">
        <ion-icon slot="icon-only" :icon="svg(mdiPaletteOutline)"></ion-icon>
        <SelectColorMenu
          @update:stroke-color="color => selectAction(DrawAction.ChangeStrokeColour, { color })"
          @update:fill-color="color => selectAction(DrawAction.ChangeFillColour, { color })"
          @update:background-color="color => selectAction(DrawAction.ChangeBackgroundColor, { color })"
        />
      </ion-button>
      <div v-if="isText">
        <ion-button id="text_options">
          <ion-icon slot="icon-only" :icon="svg(mdiFormatText)"></ion-icon>
        </ion-button>
        <TextMenu />

        <ion-button id="font">
          <ion-icon slot="icon-only" :icon="svg(mdiFormatFont)"></ion-icon>
        </ion-button>
        <FontMenu @font_selected="font => selectAction(DrawAction.ChangeFont, { font })" />
      </div>
    </ion-buttons>

    <ion-buttons slot="end">
      <ion-button @click="undo" :disabled="undoStack.length == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiUndo)"></ion-icon>
      </ion-button>

      <ion-button @click="redo" :disabled="redoStack.length == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiRedo)"></ion-icon>
      </ion-button>

      <ion-button id="select_extra_options">
        <ion-icon slot="icon-only" :icon="svg(mdiDotsVertical)" />
        <SelectExtraOptions />
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</template>

<script lang="ts" setup>
import { svg } from '@/helper/general.helper'
import {
  mdiCancel,
  mdiClose,
  mdiCursorText,
  mdiDotsVertical,
  mdiFormatFont,
  mdiFormatText,
  mdiPaletteOutline,
  mdiRedo,
  mdiUndo,
  mdiVectorCurve
} from '@mdi/js'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import FontMenu from '@/components/draw/menu/FontMenu.vue'
import { IText } from 'fabric/fabric-impl'
import SelectColorMenu from '@/components/draw/menu/SelectColorMenu.vue'
import { fabric } from 'fabric'
import SelectExtraOptions from '@/components/draw/menu/SelectExtraOptions.vue'
import { useSelect } from '@/service/draw/tools/select.service'
import { useHistory } from '@/service/draw/history.service'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawAction } from '@/types/draw.types'
import TextMenu from '@/components/draw/menu/TextMenu.vue'

const { selectAction } = useDrawStore()
const { saveState, undo, redo } = useHistory()
const { undoStack, redoStack } = storeToRefs(useHistory())
const { selectedObjectsRef } = storeToRefs(useSelect())
const { setSelectedObjects } = useSelect()

const containsImage = computed(() => selectedObjectsRef.value.map(obj => obj.type).includes('image'))
const isText = computed(() => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == 'i-text')
</script>

<style scoped>
ion-button {
  width: 46px !important;
  height: 46px !important;
}

ion-button ion-icon {
  width: 100% !important;
  height: 100% !important;
}

ion-button::part(native) {
  @apply p-3;
}

ion-buttons {
  @apply h-[46px] top-0 relative;
}

ion-toolbar {
  --min-height: 46px;
}
</style>
