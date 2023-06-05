<template>
  <ion-toolbar color="primary" class="h-[46px]">
    <ion-buttons slot="start">
      <ion-button
        :class="{ selected: penMenuSelected }"
        @click="selectTool(DrawTool.Pen, { openMenu: true, e: $event })"
      >
        <ion-icon slot="icon-only" :icon="svg(penIconMapping[brushType])"></ion-icon>
      </ion-button>
      <PenMenu />
      <ion-button
        :class="{ selected: ERASERS.includes(selectedTool) }"
        @click="selectTool(lastSelectedEraserTool, { openMenu: true, e: $event })"
      >
        <ion-icon slot="icon-only" :icon="svg(eraserIconMapping[lastSelectedEraserTool])" size="large" />
      </ion-button>
      <EraserMenu />

      <ion-button id="more_tools">
        <ion-icon slot="icon-only" :icon="svg(mdiPlus)"></ion-icon>
      </ion-button>
      <MoreToolsMenu />
      <StickerMenu />

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
      <ion-button @click="send">
        <ion-icon slot="icon-only" :icon="svg(mdiSend)"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</template>

<script lang="ts" setup>
import { DrawTool } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { eraserIconMapping, ERASERS, penIconMapping, PENS } from '@/config/draw.config'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { svg } from '@/helper/general.helper'
import { mdiCursorMove, mdiPlus, mdiRedo, mdiSend, mdiUndo } from '@mdi/js'
import PenMenu from '@/components/draw/menu/PenMenu.vue'
import { computed } from 'vue'
import EraserMenu from '@/components/draw/menu/EraserMenu.vue'
import StickerMenu from '@/components/draw/menu/StickerMenu.vue'
import MoreToolsMenu from '@/components/draw/menu/MoreToolsMenu.vue'
import { usePen } from '@/service/draw/tools/pen.service'
import { useHistory } from '@/service/draw/history.service'

const drawStore = useDrawStore()
const { selectTool, send } = drawStore
const { brushType } = storeToRefs(usePen())
const { selectedTool, lastSelectedEraserTool } = storeToRefs(drawStore)

const { undo, redo } = useHistory()
const { undoStack, redoStack } = storeToRefs(useHistory())

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
