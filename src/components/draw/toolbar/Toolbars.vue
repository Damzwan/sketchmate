<template>
  <Toolbar v-if="addTextMode" :config="toolbarConfig.addText"
           :selectedTool="selectedTool" />
  <Toolbar v-else-if="colorPickerMode" :config="toolbarConfig.colorPicker"
           :selectedTool="selectedTool" />
  <Toolbar v-else-if="shapeCreationMode != undefined " :config="toolbarConfig.shape"
           :selectedTool="selectedTool" />
  <Toolbar v-else-if="isSelectActive" :config="toolbarConfig.select"
           :selectedTool="selectedTool" />
  <Toolbar v-else :config="toolbarConfig.drawing" :selectedTool="selectedTool" />
</template>

<script setup lang="ts">

import { storeToRefs } from 'pinia'
import { getToolbarConfig } from '@/draw/config/toolbar.config'
import Toolbar from '@/components/draw/toolbar/Toolbar.vue'
import { computed } from 'vue'
import { ObjectType } from '@/draw/types/draw.types'
import { useAuthStore } from '@/store/auth.store'
import { usePen } from '@/draw/store/tools/pen.store'
import { useSelect } from '@/draw/store/tools/select.store'
import { useDrawHistoryManager } from '@/draw/store/drawHistoryManager.store'
import { useToolSelection } from '@/draw/store/tools/toolSelection.store'
import { useDrawUIStore } from '@/draw/store/drawUI.store'
import { useNetworkStore } from '@/store/network.store'
import { useDrawStore } from '@/draw/store/draw.store'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'


const { lastSelectedPenMenuTool, lastSelectedSelectTool, selectedTool } = storeToRefs(useToolSelection())
const { shapeCreationMode, colorPickerMode, addTextMode } = storeToRefs(useDrawUIStore())

const { brushType } = storeToRefs(usePen())
const { isSelectActive, selectedObjectsRef } = storeToRefs(useSelect())
const { undoStackCounter, redoStackCounter } = storeToRefs(useDrawHistoryManager())
const { user, isLoggedIn } = storeToRefs(useAuthStore())
const { networkStatus } = storeToRefs(useNetworkStore())
const { isModal } = storeToRefs(useDrawStore())
const { roomMembers } = storeToRefs(useDrawSyncer())


const containsImage = computed(() => selectedObjectsRef.value.map(obj => obj.type).includes('image'))
const isText = computed(
  () => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == ObjectType.text
)
const isPolygon = computed(
  () => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == ObjectType.polygon
)
const isImg = computed(
  () => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == ObjectType.image
)

const isEditingPolygon = computed(() => isPolygon.value && 'edit' in selectedObjectsRef.value[0])
const undoStackDisabled = computed(() => undoStackCounter.value == 0)
const redoStackDisabled = computed(() => redoStackCounter.value == 0)

const isOffline = computed(() => !!networkStatus.value && !networkStatus.value.connected)
const hasMate = computed(() => !!user.value && user.value.mates.length > 0)


const toolbarConfig = computed(() =>
  getToolbarConfig(
    lastSelectedPenMenuTool.value,
    lastSelectedSelectTool.value,
    brushType.value,
    isText.value,
    isPolygon.value,
    isImg.value,
    containsImage.value,
    isEditingPolygon.value,
    undoStackDisabled.value,
    redoStackDisabled.value,
    isOffline.value,
    hasMate.value,
    isLoggedIn.value,
    isModal.value,
    roomMembers.value
  ))


</script>


<style scoped>

</style>