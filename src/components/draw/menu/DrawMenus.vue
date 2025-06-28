<template>
  <PenMenu />
  <EraserMenu />
  <SelectMenu />
  <ShapesMenu />
  <SendDrawer />
  <MoreToolsMenu />
  <StickersEmblemsSavedMenu />
  <SelectExtraOptionsMenu />
  <SelectImgStyleMenu :img="selectedObjectsRef[0] as any"
                      @add-filter="options => selectAction(DrawAction.AddImgFilter, { object: selectedObjectsRef[0], ...options })" />

  <SelectColorMenu
    :strokeWidth="shapeCreationMode != undefined  ? shapeCreationSettings.strokeWidth : selectedObjectsRef[0]?.strokeWidth || 0"
    :stroke-color="shapeCreationMode != undefined  ? shapeCreationSettings.stroke: selectedObjectsRef[0]?.stroke"
    :fill-color="shapeCreationMode != undefined  ? shapeCreationSettings.fill : selectedObjectsRef[0]?.fill as string"
    :background-color="shapeCreationMode != undefined  ? shapeCreationSettings.backgroundColor : selectedObjectsRef[0]?.backgroundColor"
    :disable-clear="isText ? 'fill' : 'stroke'"
    @update:stroke-color="color => shapeCreationMode != undefined ? shapeCreationSettings.stroke = color : selectAction(DrawAction.ChangeStrokeColour, { color })"
    @update:fill-color="color => shapeCreationMode != undefined ? shapeCreationSettings.fill = color : selectAction(DrawAction.ChangeFillColour, { color })"
    @update:background-color="color => shapeCreationMode != undefined ? shapeCreationSettings.backgroundColor = color : selectAction(DrawAction.ChangeBackgroundColor, { color })"
    @update:strokeWidth="strokeWidth => shapeCreationMode != undefined ? shapeCreationSettings.strokeWidth = strokeWidth : selectAction(DrawAction.ChangeStrokeWidth, { strokeWidth })"
  />
  <TextMenu />
  <FontMenu @font_selected="font => selectAction(DrawAction.ChangeFont, { font })" />
  <DocsMenu trigger="docsMenu" />
  <HelpMenu />
</template>

<script setup lang="ts">
import MoreToolsMenu from '@/components/draw/menu/MoreToolsMenu.vue'
import PenMenu from '@/components/draw/menu/PenMenu.vue'
import SelectMenu from '@/components/draw/menu/SelectMenu.vue'
import EraserMenu from '@/components/draw/menu/EraserMenu.vue'
import ShapesMenu from '@/components/draw/menu/ShapesMenu.vue'
import SendDrawer from '@/components/draw/menu/send/SendDrawer.vue'
import StickersEmblemsSavedMenu from '@/components/draw/menu/stickersEmblemsSavedMenu/StickersEmblemsSavedMenu.vue'
import SelectExtraOptionsMenu from '@/components/draw/menu/SelectExtraOptionsMenu.vue'
import { useSelect } from '@/service/draw/tools/select.tool'
import SelectColorMenu from '@/components/draw/menu/SelectColorMenu.vue'
import TextMenu from '@/components/draw/menu/TextMenu.vue'
import FontMenu from '@/components/draw/menu/FontMenu.vue'
import { DrawAction, ObjectType } from '@/types/draw.types'
import { useDrawStore } from '@/store/draw/draw.store'
import { storeToRefs } from 'pinia'
import SelectImgStyleMenu from '@/components/draw/menu/SelectImgStyleMenu.vue'
import DocsMenu from '@/components/draw/menu/DocsMenu.vue'
import HelpMenu from '@/components/draw/menu/HelpMenu.vue'
import { computed } from 'vue'

const { selectedObjectsRef } = storeToRefs(useSelect())
const { selectAction } = useDrawStore()

const isText = computed(
  () => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == ObjectType.text
)


const { shapeCreationSettings, shapeCreationMode } = storeToRefs(useDrawStore())

</script>

<style scoped>

</style>