<template>
  <div>
    <Toolbar v-if="addTextMode" :config="toolbarConfig.addText"
             :selectedTool="selectedTool" />
    <Toolbar v-else-if="colorPickerMode" :config="toolbarConfig.colorPicker"
             :selectedTool="selectedTool" />
    <Toolbar v-else-if="shapeCreationMode != undefined " :config="toolbarConfig.shape"
             :selectedTool="selectedTool" />
    <Toolbar v-else-if="selectedObjectsRef && selectedObjectsRef.length > 0" :config="toolbarConfig.select"
             :selectedTool="selectedTool" />
    <Toolbar v-else :config="toolbarConfig.drawing" :selectedTool="selectedTool" />
  </div>
</template>

<script setup lang="ts">

import { storeToRefs } from 'pinia'
import { useDrawStore } from '@/store/draw/draw.store'
import { getToolbarConfig } from '@/config/draw/toolbar.config'
import { usePen } from '@/service/draw/tools/pen.tool'
import Toolbar from '@/components/draw/toolbar/Toolbar.vue'
import { useSelect } from '@/service/draw/tools/select.tool'
import { computed, watch } from 'vue'
import { ObjectType } from '@/types/draw.types'
import { useHistory } from '@/service/draw/history.service'
import { useAuthStore } from '@/store/auth.store'

const {
  lastSelectedSelectTool,
  lastSelectedEraserTool,
  lastSelectedPenMenuTool,
  shapeCreationMode,
  colorPickerMode,
  addTextMode,
  selectedTool
} = storeToRefs(useDrawStore())
const { brushType } = storeToRefs(usePen())
const { selectedObjectsRef } = storeToRefs(useSelect())
const { undoStackCounter, redoStackCounter } = storeToRefs(useHistory())
const { networkStatus, user, isLoggedIn } = storeToRefs(useAuthStore())


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
    lastSelectedEraserTool.value,
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
    isLoggedIn.value
))


</script>


<style scoped>

</style>