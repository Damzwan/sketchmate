<template>
  <ion-toolbar color="primary" mode="md">
    <ion-buttons slot="start">
      <ion-button
        id="pen"
        data-step="1"
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
        id="eraser"
        data-step="2"
        :class="{ selected: ERASERS.includes(selectedTool) }"
        @click="selectTool(lastSelectedEraserTool, { openMenu: true, e: $event })"
      >
        <ion-icon slot="icon-only" :icon="svg(eraserIconMapping[lastSelectedEraserTool])" size="large" />
        <div class="selected_chevron" v-if="ERASERS.includes(selectedTool)">
          <ion-icon :icon="svg(mdiChevronDown)" />
        </div>
      </ion-button>
      <EraserMenu />

      <ion-button id="more_tools" data-step="3">
        <ion-icon slot="icon-only" :icon="svg(mdiPlus)"></ion-icon>
      </ion-button>
      <MoreToolsMenu />
      <StickersEmblemsSavedMenu />

      <ion-button
        id="select-tool"
        :class="{ selected: SELECTMENUTOOLS.includes(selectedTool) }"
        @click="selectTool(lastSelectedSelectTool, { openMenu: true, e: $event })"
        data-step="4"
      >
        <ion-icon slot="icon-only" :icon="svg(selectIconMapping[lastSelectedSelectTool])"></ion-icon>
        <div class="selected_chevron" v-if="SELECTMENUTOOLS.includes(selectedTool)">
          <ion-icon :icon="svg(mdiChevronDown)" />
        </div>
        <SelectMenu />
      </ion-button>

      <ion-button id="docs" data-step="8">
        <ion-icon slot="icon-only" :icon="svg(mdiHelp)"></ion-icon>
      </ion-button>
      <DocsMenu trigger="docs" />
    </ion-buttons>

    <ion-buttons slot="end" class="h-[40px]">
      <ion-button @click="undo" id="undo" :disabled="undoStackCounter == 0" data-step="6">
        <ion-icon slot="icon-only" :icon="svg(mdiUndo)"></ion-icon>
      </ion-button>

      <ion-button @click="redo" id="redo" :disabled="redoStackCounter == 0">
        <ion-icon slot="icon-only" :icon="svg(mdiRedo)"></ion-icon>
      </ion-button>

      <ion-button
        v-show="hasMate"
        id="send-drawing"
        :disabled="!isLoggedIn || (!!networkStatus && !networkStatus.connected)"
        data-step="7"
      >
        <ion-icon slot="icon-only" :icon="svg(mdiSend)"></ion-icon>
      </ion-button>

      <ion-button
        @click="() => toast('Connect to a friend first', {color: 'danger', duration: ToastDuration.long, buttons: [connectButton]})"
        v-if="!hasMate"
        :disabled="!isLoggedIn || (!!networkStatus && !networkStatus.connected)"
        data-step="7"
      >
        <ion-icon slot="icon-only" :icon="svg(mdiSend)"></ion-icon>
      </ion-button>

      <SendDrawer :user="user" v-if="user" />
      <!--      <ConfirmationAlert header="Ready to send?" trigger="send-drawing" confirmationtext="Send" @confirm="send" />-->
    </ion-buttons>
  </ion-toolbar>
</template>

<script lang="ts" setup>
import { DrawTool } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import {
  eraserIconMapping,
  ERASERS,
  penIconMapping,
  PENMENUTOOLS,
  selectIconMapping,
  SELECTMENUTOOLS
} from '@/config/draw/draw.config'
import { IonButton, IonButtons, IonIcon, IonToolbar } from '@ionic/vue'
import { svg } from '@/helper/general.helper'
import { mdiChevronDown, mdiFormatColorFill, mdiHelp, mdiPlus, mdiRedo, mdiSend, mdiUndo } from '@mdi/js'
import PenMenu from '@/components/draw/menu/PenMenu.vue'
import EraserMenu from '@/components/draw/menu/EraserMenu.vue'
import StickersEmblemsSavedMenu from '@/components/draw/menu/StickersEmblemsSavedMenu/StickersEmblemsSavedMenu.vue'
import MoreToolsMenu from '@/components/draw/menu/MoreToolsMenu.vue'
import { usePen } from '@/service/draw/tools/pen.tool'
import { useHistory } from '@/service/draw/history.service'
import { computed } from 'vue'
import { useAppStore } from '@/store/app.store'
import DocsMenu from '@/components/draw/menu/DocsMenu.vue'
import SelectMenu from '@/components/draw/menu/SelectMenu.vue'
import SendDrawer from '@/components/draw/SendDrawer.vue'
import { useToast } from '@/service/toast.service'
import { ToastDuration } from '@/types/toast.types'
import { connectButton } from '@/config/toast.config'

const drawStore = useDrawStore()
const { selectTool, send } = drawStore
const { brushType } = storeToRefs(usePen())
const { networkStatus } = storeToRefs(useAppStore())
const { selectedTool, lastSelectedEraserTool, lastSelectedPenMenuTool, lastSelectedSelectTool } = storeToRefs(drawStore)

const { undo, redo } = useHistory()
const { undoStackCounter, redoStackCounter } = storeToRefs(useHistory())

const { toast } = useToast()

const { isLoggedIn, user } = storeToRefs(useAppStore())
const hasMate = computed(() => user.value && user.value.mates.length > 0)

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
  width: var(--toolbar-height) !important;
  height: var(--toolbar-height) !important;
}

ion-button::part(native) {
  @apply p-[11px];
}

ion-buttons {
  @apply h-[var(--toolbar-height)] top-0 relative;
}

ion-toolbar {
  --min-height: var(--toolbar-height);
  --height: var(--toolbar-height);
}
</style>
