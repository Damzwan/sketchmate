<template>
  <div
    class="flex items-center p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] shadow-lg space-x-1"
  >
    <ToolButton :icon="svg(mdiClose)" @click="unselectObjects" custom-class="hover:bg-primary/20">
      <div
        v-if="multiSelectMode"
        class="absolute -top-1 -right-1 bg-secondary text-white text-[10px] font-black w-4 h-4 flex items-center justify-center rounded-full shadow-sm border border-white/20"
      >
        {{ selectedObjectsRef.length }}
      </div>
    </ToolButton>

    <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

    <ToolButton
      :icon="svg(mdiDeleteOutline)"
      @click="removeSelected"
      custom-class="hover:bg-red-400/20"
    />

    <ToolButton
      v-if="!containsImage"
      :icon="svg(mdiPaletteOutline)"
      @click="openMenu(Menu.SelectColor, $event)"
    />

    <ToolButton
      v-if="isImg"
      :icon="svg(mdiPaletteOutline)"
      @click="openMenu(Menu.SelectImgStyle, $event)"
    />

    <template v-if="isText">
      <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

      <ToolButton
        :icon="svg(mdiFormatText)"
        @click="openMenu(Menu.Text, $event)"
      />

      <button
        @click="openMenu(Menu.Font, $event)"
        class="flex items-center justify-between bg-primary/20 border border-primary/40 h-10 px-3 rounded-xl min-w-[100px] max-w-[140px] active:scale-95 transition-all shadow-inner"
      >
        <span class="text-sm text-black font-bold truncate mr-1" :style="{ fontFamily: fontFamily }">
          {{ fontFamily || 'Font' }}
        </span>
        <ion-icon :icon="svg(mdiMenuSwapOutline)" class="w-4 h-4 text-black/50 shrink-0" />
      </button>
    </template>

    <ToolButton
      :icon="svg(mdiDotsVertical)"
      @click="openMenu(Menu.SelectMoreOptions, $event)"
    />

    <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

    <ToolButton :icon="svg(mdiUndo)" :disabled="undoDisabled" @click="undo" />
    <ToolButton :icon="svg(mdiRedo)" :disabled="redoDisabled" @click="redo" />


  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSelect } from '@/draw/store/tools/select.store'
import { useDrawStore } from '@/draw/store/draw.store'
import { useMenuStore } from '@/store/menu.store'
import ToolButton from './ToolButton.vue'
import { IonIcon } from '@ionic/vue'

import {
  mdiClose,
  mdiDeleteOutline,
  mdiPaletteOutline,
  mdiFormatText,
  mdiMenuSwapOutline,
  mdiDotsVertical, mdiUndo, mdiRedo
} from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { DrawAction, Menu, ObjectType } from '@/draw/types/draw.types'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'

const { selectedObjectsRef, multiSelectMode } = storeToRefs(useSelect())
const { selectAction } = useDrawStore()
const { openMenu } = useMenuStore()
const { undoDisabled, redoDisabled } = storeToRefs(useDrawHistoryManager())


// Localized Computed Logic
const containsImage = computed(() => selectedObjectsRef.value.map(obj => obj.type).includes('image'))
const isText = computed(() => selectedObjectsRef.value.length === 1 && selectedObjectsRef.value[0].type === ObjectType.text)
const isImg = computed(() => selectedObjectsRef.value.length === 1 && selectedObjectsRef.value[0].type === ObjectType.image)

// @ts-ignore
const fontFamily = computed(() => selectedObjectsRef.value[0] ? selectedObjectsRef.value[0]['fontFamily'] as string : undefined)

// Actions
const unselectObjects = () => selectAction(DrawAction.UnselectObjects, undefined)
const removeSelected = () => selectAction(DrawAction.RemoveSelectedObjects, undefined)

const undo = () => selectAction(DrawAction.Undo, undefined)
const redo = () => selectAction(DrawAction.Redo, undefined)
</script>