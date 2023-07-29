<template>
  <ion-toolbar color="primary" class="h-[43px]" mode="md">
    <ion-buttons slot="start" class="flex flex-grow">
      <ion-button @click="unselectObjects" mode="md" color="black">
        <ion-icon slot="icon-only" :icon="svg(mdiClose)"></ion-icon>
      </ion-button>

      <div class="w-[20px] h-[43px] text-center flex justify-center items-center" v-if="multiSelectMode">
        <p class="text-xl">
          {{ selectedObjectsRef.length }}
        </p>
      </div>
    </ion-buttons>

    <ion-buttons slot="end">
      <ion-button id="select_color" v-if="!containsImage" @click="exitEditing(selectedObjectsRef[0])">
        <ion-icon slot="icon-only" :icon="svg(mdiPaletteOutline)"></ion-icon>
        <SelectColorMenu
          @update:stroke-color="color => selectAction(DrawAction.ChangeStrokeColour, { color })"
          @update:fill-color="color => selectAction(DrawAction.ChangeFillColour, { color })"
          @update:background-color="color => selectAction(DrawAction.ChangeBackgroundColor, { color })"
        />
      </ion-button>

      <ion-button @click="selectAction(DrawAction.EditPolygon)" v-if="isPolygon">
        <ion-icon slot="icon-only" :icon="svg(selectedObjectsRef[0]['edit'] ? mdiCancel : mdiVectorPolygon)"></ion-icon>
      </ion-button>

      <div v-if="isText" class="flex items-center flex-grow">
        <ion-button id="text_options">
          <ion-icon slot="icon-only" :icon="svg(mdiFormatText)"></ion-icon>
        </ion-button>
        <TextMenu />

        <ion-button id="font" class="font_text">
          <div class="flex justify-between w-full h-full items-center">
            <p class="text-sm2 truncate" :style="{ fontFamily: selectedObjectsRef[0]['fontFamily'] }">{{
              selectedObjectsRef[0]['fontFamily']
            }}</p>
            <ion-icon :icon="svg(mdiMenuSwapOutline)" />
          </div>
        </ion-button>
        <FontMenu @font_selected="font => selectAction(DrawAction.ChangeFont, { font })" />
      </div>

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
  mdiAbjadHebrew,
  mdiCancel,
  mdiClose,
  mdiDotsVertical,
  mdiFormatText,
  mdiMenuSwapOutline,
  mdiPaletteOutline,
  mdiRedo,
  mdiUndo,
  mdiVectorPolygon
} from '@mdi/js'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import FontMenu from '@/components/draw/menu/FontMenu.vue'
import SelectColorMenu from '@/components/draw/menu/SelectColorMenu.vue'
import SelectExtraOptions from '@/components/draw/menu/SelectExtraOptionsMenu.vue'
import { useSelect } from '@/service/draw/tools/select.tool'
import { useHistory } from '@/service/draw/history.service'
import { useDrawStore } from '@/store/draw/draw.store'
import { DrawAction, ObjectType } from '@/types/draw.types'
import TextMenu from '@/components/draw/menu/TextMenu.vue'
import { exitEditing } from '@/helper/draw/draw.helper'

const { selectAction, getCanvas } = useDrawStore()
const { undo, redo } = useHistory()
const { undoStack, redoStack } = storeToRefs(useHistory())

const { setMouseClickTarget } = useSelect()
const { selectedObjectsRef, multiSelectMode } = storeToRefs(useSelect())

const containsImage = computed(() => selectedObjectsRef.value.map(obj => obj.type).includes('image'))
const isText = computed(
  () => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == ObjectType.text
)
const isPolygon = computed(
  () => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == ObjectType.polygon
)

function unselectObjects() {
  setMouseClickTarget(undefined) // small hack
  getCanvas().discardActiveObject()
}
</script>

<style scoped>
ion-button {
  width: 43px !important;
  height: 43px !important;
}

ion-button ion-icon {
  width: 100% !important;
  height: 100% !important;
  color: black;
}

ion-button::part(native) {
  @apply p-[0.675rem];
}

ion-toolbar .toolbar-container {
  @apply bg-red-600 z-10 !important;
}

ion-toolbar {
  --min-height: 43px;
}

.font_text {
  @apply p-2 mr-2 border-[1px] border-black h-[36px] rounded w-20 !important;
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
