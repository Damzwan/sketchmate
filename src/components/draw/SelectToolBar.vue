<template>
  <ion-toolbar color="primary" class="h-[46px]">
    <ion-buttons slot="start">
      <ion-button @click="setSelectedObjects([])">
        <ion-icon slot="icon-only" :icon="svg(mdiClose)"></ion-icon>
      </ion-button>

      <ion-button id="select_color" v-if="!containsImage">
        <ion-icon slot="icon-only" :icon="svg(mdiPaletteOutline)"></ion-icon>
        <SelectColorMenu
          @update:stroke-color="setStrokeColor"
          @update:fill-color="setFillColor"
          @update:background-color="setBackgroundColor"
        />
      </ion-button>
      <div v-if="isText">
        <ion-button @click="changeTextEdit">
          <ion-icon
            slot="icon-only"
            :icon="svg(selectedObjectsRef[0].isEditing ? mdiCancel : mdiCursorText)"
          ></ion-icon>
        </ion-button>

        <ion-button @click="curveText">
          <ion-icon slot="icon-only" :icon="svg(mdiVectorCurve)"></ion-icon>
        </ion-button>

        <ion-button id="font">
          <ion-icon slot="icon-only" :icon="svg(mdiFormatFont)"></ion-icon>
        </ion-button>
        <FontMenu @font_selected="changeFont" />
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
  mdiCross,
  mdiCursorText,
  mdiDotsVertical,
  mdiFormatFont,
  mdiPaletteOutline,
  mdiRedo,
  mdiUndo,
  mdiVectorCurve
} from '@mdi/js'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { useDrawStore } from '@/store/draw.store'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { DrawAction } from '@/types/draw.types'
import { selectLastModifiedObjects } from '@/helper/draw/draw.helper'
import FontMenu from '@/components/draw/FontMenu.vue'
import { IText } from 'fabric/fabric-impl'
import SelectColorMenu from '@/components/draw/SelectColorMenu.vue'
import { fabric } from 'fabric'
import FontFaceObserver from 'fontfaceobserver'
import SelectExtraOptions from '@/components/draw/SelectExtraOptions.vue'

const {
  setSelectedObjects,
  refresh,
  getSelectedObjects,
  saveState,
  selectAction,
  deleteObjects,
  getCanvas,
  undo,
  redo,
  addSaved
} = useDrawStore()
const { selectedObjectsRef, undoStack, redoStack } = storeToRefs(useDrawStore())

const containsImage = computed(() => selectedObjectsRef.value.map(obj => obj.type).includes('image'))
const isText = computed(() => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == 'i-text')
function setStrokeColor(color: string) {
  exitEditing() // TODO horrible solution :(
  selectedObjectsRef.value.forEach(obj => obj.set({ stroke: color }))
  saveState()
  refresh()
}

function setFillColor(color: string) {
  exitEditing() // TODO horrible solution :(
  selectedObjectsRef.value.forEach(obj => obj.set({ fill: color }))
  saveState()
  refresh()
}

function setBackgroundColor(color: string) {
  exitEditing() // TODO horrible solution :(
  selectedObjectsRef.value.forEach(obj => obj.set({ backgroundColor: color }))
  saveState()
  refresh()
}

function exitEditing() {
  if (isText.value) {
    const text = selectedObjectsRef.value[0] as IText
    text.exitEditing()
  }
}

async function changeFont(selectedFont: string) {
  const textObj = selectedObjectsRef.value[0] as fabric.IText
  textObj.exitEditing()
  const font = new FontFaceObserver(selectedFont)
  await font.load()
  textObj.set({ fontFamily: selectedFont })
  refresh()
}

function curveText() {
  const textObj = selectedObjectsRef.value[0] as fabric.IText

  // Create a temporary path with a width based on the length of the text
  const textWidth = textObj.width!
  const textHeight = textObj.height!
  const curvePathWidth = textWidth + 20 // Adjust the padding as needed

  // Calculate the control point for the quadratic Bezier curve
  const controlPointX = 0
  const controlPointY = -textHeight

  const curvePathCommands = `M ${-curvePathWidth / 2} 0 Q ${controlPointX} ${controlPointY} ${curvePathWidth / 2} 0`

  const curvePath = new fabric.Path(curvePathCommands, {
    fill: '',
    stroke: ''
  })

  textObj.set({ path: curvePath })

  textObj.exitEditing()
  refresh()
}

function changeTextEdit() {
  const textObj = selectedObjectsRef.value[0] as IText
  textObj.isEditing ? textObj.exitEditing() : textObj.enterEditing()
}
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
