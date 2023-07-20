<template>
  <ion-toolbar color="primary" class="h-[46px]" mode="md">
    <ion-buttons slot="start">
      <ion-button
        :class="{ selected: PENMENUTOOLS.includes(selectedTool) }"
        @click="selectTool(lastSelectedPenMenuTool, { openMenu: true, e: $event })"
      >
        <ion-icon slot="icon-only" :icon="svg(penMenuIcon)"></ion-icon>
        <div class="selected_chevron" v-if="PENMENUTOOLS.includes(selectedTool)">
          <ion-icon :icon="svg(mdiChevronDown)" />
        </div>
      </ion-button>
      <PenMenu />
      <ion-button
        :class="{ selected: ERASERS.includes(selectedTool) }"
        @click="selectTool(lastSelectedEraserTool, { openMenu: true, e: $event })"
      >
        <ion-icon slot="icon-only" :icon="svg(eraserIconMapping[lastSelectedEraserTool])" size="large" />
        <div class="selected_chevron" v-if="ERASERS.includes(selectedTool)">
          <ion-icon :icon="svg(mdiChevronDown)" />
        </div>
      </ion-button>
      <EraserMenu />

      <ion-button id="more_tools">
        <ion-icon slot="icon-only" :icon="svg(mdiPlus)"></ion-icon>
      </ion-button>
      <MoreToolsMenu />
      <StickersEmblemsSavedMenu />

      <ion-button :class="{ selected: selectedTool == DrawTool.Select }" @click="selectTool(DrawTool.Select)">
        <ion-icon slot="icon-only" :icon="svg(mdiCursorDefaultClickOutline)"></ion-icon>
      </ion-button>

      <ion-button :class="{ selected: selectedTool == DrawTool.Lasso }" @click="selectTool(DrawTool.Lasso)">
        <ion-icon slot="icon-only" :icon="svg(mdiLasso)"></ion-icon>
      </ion-button>
    </ion-buttons>

    <ion-buttons slot="end" class="h-[40px]">
      <ion-button @click="undo" :disabled="undoStack.length == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiUndo)"></ion-icon>
      </ion-button>

      <ion-button @click="redo" :disabled="redoStack.length == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiRedo)"></ion-icon>
      </ion-button>

      <ion-button @click="send" :disabled="!isLoggedIn">
        <ion-icon slot="icon-only" :icon="svg(mdiSend)"></ion-icon>
      </ion-button>
    </ion-buttons>
  </ion-toolbar>
</template>

<script lang="ts" setup>
import { DrawTool } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import { eraserIconMapping, ERASERS, penIconMapping, PENMENUTOOLS } from '@/config/draw/draw.config'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { svg } from '@/helper/general.helper'
import {
  mdiBucketOutline,
  mdiChevronDown,
  mdiCursorDefaultClickOutline,
  mdiFormatColorFill,
  mdiLasso,
  mdiPlus,
  mdiRedo,
  mdiSend,
  mdiUndo
} from '@mdi/js'
import PenMenu from '@/components/draw/menu/PenMenu.vue'
import EraserMenu from '@/components/draw/menu/EraserMenu.vue'
import StickersEmblemsSavedMenu from '@/components/draw/menu/StickersEmblemsSavedMenu/StickersEmblemsSavedMenu.vue'
import MoreToolsMenu from '@/components/draw/menu/MoreToolsMenu.vue'
import { usePen } from '@/service/draw/tools/pen.tool'
import { useHistory } from '@/service/draw/history.service'
import { computed, ref } from 'vue'
import { useAppStore } from '@/store/app.store'
import { useMenuStore } from '@/store/draw/menu.store'

const drawStore = useDrawStore()
const { selectTool, send } = drawStore
const { brushType } = storeToRefs(usePen())
const { selectedTool, lastSelectedEraserTool, lastSelectedPenMenuTool } = storeToRefs(drawStore)

const { undo, redo } = useHistory()
const { undoStack, redoStack } = storeToRefs(useHistory())

const { isLoggedIn } = storeToRefs(useAppStore())

const penMenuIcon = computed(() =>
  lastSelectedPenMenuTool.value == DrawTool.Pen ? penIconMapping[brushType.value] : mdiFormatColorFill
)
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

.selected_chevron {
  @apply w-[15px] h-[15px] absolute right-[-15px] bottom-0;
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
