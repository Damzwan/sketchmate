<template>
  <PenMenu />
  <BucketMenu />
  <EraserMenu />
  <SelectMenu />
  <ShapesMenu />
  <MoreToolsMenu />
  <SavedDrawingMenu/>
  <SelectExtraOptionsMenu />
  <SelectImgStyleMenu :img="selectedObjectsRef[0] as any"
                      @add-filter="options => selectAction(DrawAction.AddImgFilter, { image: selectedObjectsRef[0], ...options })" />

  <SelectColorMenu
    :objectType="selectedObjectsRef[0]?.type"
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
  <HelpMenu />
  <RoomMenu />
  <TextEditMenu />
</template>

<script setup lang="ts">
import { DrawAction } from "@/draw/actions/drawAction.types";
import { ObjectType } from "@/draw/objects/object.types";
import { useDrawStore } from '@/draw/session/draw.store'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import PenMenu from '@/components/draw/menus/PenMenu/PenMenu.vue'
import { useSelect } from '@/draw/tools/select.store'
import EraserMenu from '@/components/draw/menus/EraserMenu.vue'
import SelectMenu from '@/components/draw/menus/SelectMenu.vue'
import TextMenu from '@/components/draw/menus/TextMenu.vue'
import FontMenu from '@/components/draw/menus/FontMenu.vue'
import MoreToolsMenu from '@/components/draw/menus/MoreToolsMenu.vue'
import HelpMenu from '@/components/draw/menus/HelpMenu.vue'
import SelectExtraOptionsMenu from '@/components/draw/menus/SelectExtraOptionsMenu.vue'
import ShapesMenu from '@/components/draw/menus/ShapesMenu.vue'
import SelectImgStyleMenu from '@/components/draw/menus/SelectImgStyleMenu.vue'
import SelectColorMenu from '@/components/draw/menus/SelectColorMenu.vue'
import { useDrawUIStore } from '@/draw/ui/drawUI.store'
import { useShapeCreation } from '@/draw/tools/shapeCreation.store'
import RoomMenu from '@/components/draw/menus/RoomMenu.vue'
import { useDrawSyncer } from '@/draw/sync/session.store'
import BucketMenu from '@/components/draw/menus/BucketMenu.vue'
import TextEditMenu from '@/components/draw/TextEditMenu.vue'
import SavedDrawingMenu from '@/components/draw/menus/SavedDrawingMenu.vue'

const { selectedObjectsRef } = storeToRefs(useSelect());
const { selectAction } = useDrawStore();
const { roomId } = storeToRefs(useDrawSyncer());

const isText = computed(
	() =>
		selectedObjectsRef.value.length == 1 &&
		selectedObjectsRef.value[0].type == ObjectType.text,
);

const { shapeCreationMode } = storeToRefs(useDrawUIStore());
const { shapeCreationSettings } = storeToRefs(useShapeCreation());
</script>

<style scoped>

</style>
