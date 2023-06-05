<template>
  <div class="h-[46px] flex w-full bg-primary text-black">
    <ion-buttons slot="start" class="flex flex-grow">
      <ion-button @click="setSelectedObjects([])" mode="md" color="black">
        <ion-icon slot="icon-only" :icon="svg(mdiClose)"></ion-icon>
      </ion-button>

      <ion-button id="select_color" v-if="!containsImage" @click="exitEditing(selectedObjectsRef[0])">
        <ion-icon slot="icon-only" :icon="svg(mdiPaletteOutline)"></ion-icon>
        <SelectColorMenu
          @update:stroke-color="color => selectAction(DrawAction.ChangeStrokeColour, { color })"
          @update:fill-color="color => selectAction(DrawAction.ChangeFillColour, { color })"
          @update:background-color="color => selectAction(DrawAction.ChangeBackgroundColor, { color })"
        />
      </ion-button>
      <div v-if="isText" class="flex items-center flex-grow">
        <ion-button id="text_options" @click="exitEditing(selectedObjectsRef[0])">
          <ion-icon slot="icon-only" :icon="svg(mdiFormatText)"></ion-icon>
        </ion-button>
        <TextMenu />

        <ion-button id="font" class="font_text" @click="exitEditing(selectedObjectsRef[0])">
          <div class="flex justify-between w-full h-full items-center">
            <p class="text-xs truncate" :style="{ fontFamily: selectedObjectsRef[0]['fontFamily'] }">{{
              selectedObjectsRef[0]['fontFamily']
            }}</p>
            <ion-icon :icon="svg(mdiMenuSwapOutline)" />
          </div>
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
  </div>
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
  mdiMenuSwapOutline,
  mdiPaletteOutline,
  mdiRedo,
  mdiUndo,
  mdiVectorCurve
} from '@mdi/js'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed, watch } from 'vue'
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
import { exitEditing } from '@/helper/draw/draw.helper'

const { selectAction } = useDrawStore()
const { saveState, undo, redo } = useHistory()
const { undoStack, redoStack } = storeToRefs(useHistory())
const { selectedObjectsRef } = storeToRefs(useSelect())
const { setSelectedObjects } = useSelect()

const containsImage = computed(() => selectedObjectsRef.value.map(obj => obj.type).includes('image'))
const isText = computed(() => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == 'i-text')

watch(selectedObjectsRef, () => {
  console.log(selectedObjectsRef.value)
})
</script>

<style scoped>
ion-button {
  width: 46px !important;
  height: 46px !important;
}

ion-button ion-icon {
  width: 100% !important;
  height: 100% !important;
  color: black;
}

ion-button::part(native) {
  @apply p-3;
}

ion-toolbar .toolbar-container {
  @apply bg-red-600 z-10 !important;
}

ion-toolbar {
  --min-height: 46px;
}

.font_text {
  @apply flex-grow p-2 mr-2 border-[1px] border-black h-[36px] rounded max-w-[200px] !important;
}

.font_text::part(native) {
  padding: 0 !important;
}

.font_text ion-icon {
  width: 20px !important;
  height: 20px !important;
  color: black;
}
</style>
