<template>
  <ion-toolbar color="primary">
    <ion-buttons slot="start">
      <ion-button :class="{ selected: penMenuSelected }" @click="selectTool(lastSelectedPenTool, $event)">
        <ion-icon slot="icon-only" :icon="svg(penIconMapping[brushType])"></ion-icon>
      </ion-button>
      <PenMenu />
      <ion-button
        :class="{ selected: ERASERS.includes(selectedTool) }"
        @click="selectTool(lastSelectedEraserTool, $event)"
      >
        <ion-icon slot="icon-only" :icon="svg(eraserIconMapping[lastSelectedEraserTool])"></ion-icon>
      </ion-button>
      <EraserMenu />

      <ion-button :class="{ selected: selectedTool == DrawTool.Move }" @click="selectTool(DrawTool.Move)">
        <ion-icon slot="icon-only" :icon="svg(mdiMagnifyPlusOutline)"></ion-icon>
      </ion-button>

      <ion-button :class="{ selected: selectedTool == DrawTool.Select }" @click="selectTool(DrawTool.Select)">
        <ion-icon slot="icon-only" :icon="svg(mdiCursorMove)"></ion-icon>
      </ion-button>

      <ion-button id="stickers">
        <ion-icon slot="icon-only" :icon="svg(mdiStickerEmoji)"></ion-icon>
      </ion-button>
      <StickerMenu />

      <ion-button :class="{ selected: selectedTool == DrawTool.Bucket }" @click="selectTool(DrawTool.Bucket, $event)">
        <ion-icon slot="icon-only" :icon="svg(mdiBucketOutline)" :style="{ color: bucketColor }" />
      </ion-button>
      <BucketMenu />
    </ion-buttons>

    <ion-buttons slot="end">
      <ion-button @click="secondaryToolBarOpen = !secondaryToolBarOpen">
        <ion-icon slot="icon-only" :icon="svg(secondaryToolBarOpen ? mdiChevronUp : mdiChevronDown)"></ion-icon>
      </ion-button>
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
  mdiBucketOutline,
  mdiChevronDown,
  mdiChevronUp,
  mdiCursorMove,
  mdiMagnifyPlusOutline,
  mdiSend,
  mdiStickerEmoji
} from '@mdi/js'
import PenMenu from '@/components/draw/PenMenu.vue'
import { computed } from 'vue'
import EraserMenu from '@/components/draw/EraserMenu.vue'
import StickerMenu from '@/components/draw/StickerMenu.vue'
import BucketMenu from '@/components/draw/BucketMenu.vue'

const drawStore = useDrawStore()
const { selectTool, send } = drawStore
const { selectedTool, lastSelectedEraserTool, lastSelectedPenTool, brushType, bucketColor, secondaryToolBarOpen } =
  storeToRefs(drawStore)

const penMenuSelected = computed(() => PENS.includes(selectedTool.value))
</script>

<style scoped>
.selected::after {
  content: '';
  display: block;
  position: relative;
  bottom: 0;
  left: 10%;
  width: 80%;
  height: 3px;
  background-color: var(--ion-color-secondary);
}
</style>
