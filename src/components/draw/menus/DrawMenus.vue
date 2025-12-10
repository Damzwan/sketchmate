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
                      @add-filter="options => selectAction(DrawAction.AddImgFilter, { image: selectedObjectsRef[0], ...options })" />

  <SelectColorMenu
    :strokeWidth="shapeCreationMode != undefined  ? shapeCreationSettings.strokeWidth : selectedObjectsRef[0]?.strokeWidth || 0"
    :stroke-color="shapeCreationMode != undefined  ? shapeCreationSettings.stroke: selectedObjectsRef[0]?.stroke"
    :fill-color="shapeCreationMode != undefined  ? shapeCreationSettings.fill : selectedObjectsRef[0]?.fill as string"
    :background-color="shapeCreationMode != undefined  ? shapeCreationSettings.backgroundColor : selectedObjectsRef[0]?.backgroundColor"
    :disable-clear="isText ? 'fill' : 'stroke'"
    @update:stroke-color="color => shapeCreationMode != undefined ? shapeCreationSettings.stroke = color : selectAction(DrawAction.SetObjectStrokeColor, { color })"
    @update:fill-color="color => shapeCreationMode != undefined ? shapeCreationSettings.fill = color : selectAction(DrawAction.SetObjectFillColor, { color })"
    @update:background-color="color => shapeCreationMode != undefined ? shapeCreationSettings.backgroundColor = color : selectAction(DrawAction.SetObjectBackgroundColor, { color })"
    @update:strokeWidth="strokeWidth => shapeCreationMode != undefined ? shapeCreationSettings.strokeWidth = strokeWidth : selectAction(DrawAction.ChangeStrokeWidth, { strokeWidth })"
  />
  <TextMenu />
  <FontMenu />
  <DocsMenu trigger="docsMenu" />
  <HelpMenu />
</template>

<script setup lang="ts">
import { DrawAction, ObjectType } from '@/draw/types/draw.types'
import { useDrawStore } from '@/draw/store/draw.store'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import PenMenu from '@/components/draw/menus/PenMenu.vue'
import { useSelect } from '@/draw/store/tools/select.store'
import EraserMenu from '@/components/draw/menus/EraserMenu.vue'
import SelectMenu from '@/components/draw/menus/SelectMenu.vue'
import DocsMenu from '@/components/draw/menus/DocsMenu.vue'
import TextMenu from '@/components/draw/menus/TextMenu.vue'
import FontMenu from '@/components/draw/menus/FontMenu.vue'
import SendDrawer from '@/components/draw/menus/SendDrawer.vue'
import MoreToolsMenu from '@/components/draw/menus/MoreToolsMenu.vue'
import StickersEmblemsSavedMenu from '@/components/draw/menus/stickersEmblemsSavedMenu/StickersEmblemsSavedMenu.vue'
import HelpMenu from '@/components/draw/menus/HelpMenu.vue'
import SelectExtraOptionsMenu from '@/components/draw/menus/SelectExtraOptionsMenu.vue'
import ShapesMenu from '@/components/draw/menus/ShapesMenu.vue'
import SelectImgStyleMenu from '@/components/draw/menus/SelectImgStyleMenu.vue'
import SelectColorMenu from '@/components/draw/menus/SelectColorMenu.vue'

const { selectedObjectsRef } = storeToRefs(useSelect())
const { selectAction } = useDrawStore()

const isText = computed(
  () => selectedObjectsRef.value.length == 1 && selectedObjectsRef.value[0].type == ObjectType.text
)


const { shapeCreationSettings, shapeCreationMode } = storeToRefs(useDrawStore())


</script>

<style scoped>

</style>