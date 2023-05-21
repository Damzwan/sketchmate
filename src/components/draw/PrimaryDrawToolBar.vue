<template>
  <ion-toolbar color="primary" class="h-[46px]">
    <ion-buttons slot="start">
      <ion-button :class="{ selected: penMenuSelected }" @click="selectTool(lastSelectedPenTool, $event)">
        <ion-icon slot="icon-only" :icon="svg(penIconMapping[brushType])"></ion-icon>
      </ion-button>
      <PenMenu />
      <ion-button
        :class="{ selected: ERASERS.includes(selectedTool) }"
        @click="selectTool(lastSelectedEraserTool, $event)"
      >
        <ion-icon slot="icon-only" :icon="svg(eraserIconMapping[lastSelectedEraserTool])" size="large" />
      </ion-button>
      <EraserMenu />

      <ion-button id="stickers">
        <ion-icon slot="icon-only" :icon="svg(mdiStickerEmoji)"></ion-icon>
      </ion-button>
      <StickerMenu />

      <ion-button :class="{ selected: selectedTool == DrawTool.Move }" @click="selectTool(DrawTool.Move)">
        <ion-icon slot="icon-only" :icon="svg(mdiMagnifyPlusOutline)"></ion-icon>
      </ion-button>

      <ion-button :class="{ selected: selectedTool == DrawTool.Select }" @click="selectTool(DrawTool.Select)">
        <ion-icon slot="icon-only" :icon="svg(mdiCursorMove)"></ion-icon>
      </ion-button>

      <ion-button @click="undo" :disabled="undoStack.length == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiUndo)"></ion-icon>
      </ion-button>

      <ion-button @click="redo" :disabled="redoStack.length == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiRedo)"></ion-icon>
      </ion-button>
    </ion-buttons>

    <ion-buttons slot="end" class="h-[40px]">
      <!--      <ion-button @click="secondaryToolBarOpen = !secondaryToolBarOpen">-->
      <!--        <ion-icon slot="icon-only" :icon="svg(secondaryToolBarOpen ? mdiChevronUp : mdiChevronDown)"></ion-icon>-->
      <!--      </ion-button>-->
      <ion-button @click="send">
        <ion-icon slot="icon-only" :icon="svg(mdiSend)"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</template>

<script lang="ts" setup>
import { DrawTool } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw.store'
import { storeToRefs } from 'pinia'
import { eraserIconMapping, ERASERS, penIconMapping, PENS } from '@/config/draw.config'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { svg } from '@/helper/general.helper'
import {
  mdiChevronDown,
  mdiChevronUp,
  mdiCursorMove,
  mdiMagnifyPlusOutline,
  mdiRedo,
  mdiSend,
  mdiStickerEmoji,
  mdiUndo
} from '@mdi/js'
import PenMenu from '@/components/draw/PenMenu.vue'
import { computed } from 'vue'
import EraserMenu from '@/components/draw/EraserMenu.vue'
import StickerMenu from '@/components/draw/StickerMenu.vue'

const drawStore = useDrawStore()
const { selectTool, send, undo, redo } = drawStore
const {
  selectedTool,
  lastSelectedEraserTool,
  lastSelectedPenTool,
  brushType,
  secondaryToolBarOpen,
  undoStack,
  redoStack
} = storeToRefs(drawStore)

const penMenuSelected = computed(() => PENS.includes(selectedTool.value))
</script>

<style scoped>
.selected::after {
  content: '';
  display: block;
  position: relative;
  bottom: 3px;
  left: 10%;
  width: 80%;
  height: 3px;
  background-color: var(--ion-color-secondary);
}

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
