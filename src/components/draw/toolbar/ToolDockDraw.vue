<template>
  <div
    class="flex items-center p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] relative shadow-lg"
  >

    <div
      v-show="isMinimized"
      class="flex-shrink-0 transition-opacity duration-300"
      :class="isMinimized ? 'opacity-100 delay-150' : 'opacity-0 absolute pointer-events-none'"
    >
      <ToolButton
        :icon="svg(currentToolIcon)"
        :active="false"
        @click="isMinimized = false"
      >
        <div
          v-if="isPenActive"
          class="absolute bottom-2 right-1 w-2.5 h-2.5 rounded-full border border-white/50"
          :style="{ backgroundColor: brushColor }"
        />
      </ToolButton>
    </div>

    <div
      class="flex items-center overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
      :class="isMinimized ? 'max-w-0 opacity-0 space-x-0' : 'max-w-[500px] opacity-100 space-x-1'"
    >
      <ToolButton
        :icon="svg(penMenuIcon)"
        :active="selectedTool === lastSelectedPenMenuTool"
        @click="selectTool(lastSelectedPenMenuTool, { e: $event })"
      >
        <div class="absolute bottom-2 right-1 w-2.5 h-2.5 rounded-full border border-white/50"
             :style="{ backgroundColor: brushColor }"></div>
        <ion-icon :icon="svg(mdiChevronDown)" class="absolute -bottom-1 -right-1 w-4 h-4 text-black/50" />
      </ToolButton>

      <ToolButton
        :icon="svg(mdiEraser)"
        :active="selectedTool === DrawTool.MobileEraser"
        @click="selectTool(DrawTool.MobileEraser, { e: $event })"
      />

      <ToolButton
        :icon="svg(selectIconMapping[lastSelectedSelectTool])"
        :active="selectedTool === DrawTool.Select || selectedTool === DrawTool.Lasso"
        @click="selectTool(lastSelectedSelectTool, { e: $event })"
      >
        <ion-icon :icon="svg(mdiChevronDown)" class="absolute -bottom-1 -right-1 w-4 h-4 text-black/50" />
      </ToolButton>

      <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

      <ToolButton :icon="svg(mdiPlus)" @click="openMenu(Menu.MoreTools, $event)" />

      <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

      <ToolButton :icon="svg(mdiUndo)" :disabled="undoDisabled" @click="undo" />
      <ToolButton :icon="svg(mdiRedo)" :disabled="redoDisabled" @click="redo" />

      <ToolButton
        :icon="svg(mdiChevronLeft)"
        @click="isMinimized = true"
        custom-class="opacity-60 hover:opacity-100"
      />
    </div>

    <div
      v-if="isMinimized"
      class="absolute -right-3 z-30 pointer-events-auto cursor-pointer"
      @click="isMinimized = false"
    >
      <div
        class="bg-primary/60 rounded-full p-0.5 border border-primary/80 shadow-sm active:scale-90 transition-transform">
        <ion-icon :icon="svg(mdiChevronRight)" class="w-4 h-4 text-black" />
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { usePen } from '@/draw/store/tools/pen.store'
import { useMenuStore } from '@/store/menu.store'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import { useDrawStore } from '@/draw/store/draw.store'
import ToolButton from './ToolButton.vue'

import {
  mdiChevronLeft,
  mdiChevronRight,
  mdiChevronDown,
  mdiEraser,
  mdiFormatColorFill,
  mdiPlus,
  mdiUndo,
  mdiRedo
} from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { penIconMapping, selectIconMapping } from '@/draw/config/tools.config'
import { DrawTool, Menu, DrawAction } from '@/draw/types/draw.types'
import { IonIcon } from '@ionic/vue'

const { lastSelectedPenMenuTool, lastSelectedSelectTool, selectedTool } = storeToRefs(useToolSelection())
const { selectTool } = useToolSelection()
const { brushType, brushColor } = storeToRefs(usePen())
const { undoDisabled, redoDisabled } = storeToRefs(useDrawHistoryManager())
const { selectAction } = useDrawStore()
const { openMenu } = useMenuStore()

const isMinimized = ref(false)


const undo = () => selectAction(DrawAction.Undo, undefined)
const redo = () => selectAction(DrawAction.Redo, undefined)

const penMenuIcon = computed(() =>
  lastSelectedPenMenuTool.value === DrawTool.Pen ? penIconMapping[brushType.value] : mdiFormatColorFill
)

const currentToolIcon = computed(() => {
  if (selectedTool.value === DrawTool.MobileEraser) return mdiEraser
  if (selectedTool.value === DrawTool.Select || selectedTool.value === DrawTool.Lasso) {
    return selectIconMapping[lastSelectedSelectTool.value]
  }
  return penMenuIcon.value
})

const isPenActive = computed(() =>
  selectedTool.value !== DrawTool.MobileEraser &&
  selectedTool.value !== DrawTool.Select &&
  selectedTool.value !== DrawTool.Lasso
)
</script>