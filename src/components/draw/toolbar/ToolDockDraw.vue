<template>
  <div
    class="flex items-center p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] relative shadow-lg"
  >
    <div class="flex items-center space-x-1">
      <!-- Pen Tool -->
      <ToolButton
        id="pen"
        :icon="svg(penMenuIcon)"
        :active="selectedTool === lastSelectedPenMenuTool"
        @click="selectTool(lastSelectedPenMenuTool, { e: $event })"
      >
        <div
          class="absolute bottom-2 right-1 w-2.5 h-2.5 rounded-full border border-white/50 transition-transform"
          :style="{ backgroundColor: brushColor }"
        />
        <ion-icon
          v-if="selectedTool === lastSelectedPenMenuTool"
          :icon="svg(mdiChevronDown)"
          class="absolute -bottom-1 -right-1 w-4 h-4 text-secondary animate-in fade-in zoom-in duration-300"
        />
      </ToolButton>

      <!-- Bucket Tool -->
      <ToolButton
        id="bucket"
        :icon="svg(mdiFormatColorFill)"
        :active="selectedTool === DrawTool.Bucket"
        @click="selectTool(DrawTool.Bucket, { e: $event })"
      >
        <!-- Offset color dot slightly more to the right/down for the bucket icon -->
        <div
          class="absolute bottom-2 right-0 w-2.5 h-2.5 rounded-full border border-white/50 transition-transform"
          :style="{ backgroundColor: brushColor }"
        />
        <ion-icon
          v-if="selectedTool === DrawTool.Bucket"
          :icon="svg(mdiChevronDown)"
          class="absolute -bottom-1 -right-1 w-4 h-4 text-secondary animate-in fade-in zoom-in duration-300"
        />
      </ToolButton>

      <!-- Eraser -->
      <ToolButton
        id="eraser"
        :icon="svg(mdiEraser)"
        :active="selectedTool === DrawTool.MobileEraser"
        @click="selectTool(DrawTool.MobileEraser, { e: $event })"
      />

      <!-- Selection Tools -->
      <ToolButton
        id="select"
        :icon="svg(selectIconMapping[lastSelectedSelectTool])"
        :active="selectedTool === DrawTool.Select || selectedTool === DrawTool.Lasso"
        @click="selectTool(lastSelectedSelectTool, { e: $event })"
      >
        <ion-icon
          v-if="selectedTool === DrawTool.Select || selectedTool === DrawTool.Lasso"
          :icon="svg(mdiChevronDown)"
          class="absolute -bottom-1 -right-1 w-4 h-4 text-secondary animate-in fade-in zoom-in duration-300"
        />
      </ToolButton>

      <div class="w-[1.5px] h-6 bg-primary-shade/50 mx-1 rounded-full"></div>

      <!-- Utilities -->
      <ToolButton id="moreTools" :icon="svg(mdiPlus)" @click="openMenu(Menu.MoreTools, $event)" />

      <div class="w-[1.5px] h-6 bg-primary-shade/50 mx-1 rounded-full"></div>

      <ToolButton :icon="svg(mdiUndo)" :disabled="undoDisabled" @click="undo" id="undo" />
      <ToolButton :icon="svg(mdiRedo)" :disabled="redoDisabled" @click="redo" id="redo"/>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import {
	mdiChevronDown,
	mdiEraser,
	mdiFormatColorFill,
	mdiPlus,
	mdiRedo,
	mdiUndo,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import { DrawAction } from "@/draw/actions/drawAction.types";
import { penIconMapping, selectIconMapping } from "@/draw/config/tools.config";
import { useDrawHistoryManager } from "@/draw/history/history.store";
import { useDrawStore } from "@/draw/session/draw.store";
import { usePen } from "@/draw/tools/pen.store";
import { DrawTool } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import ToolButton from "./ToolButton.vue";

const { lastSelectedPenMenuTool, lastSelectedSelectTool, selectedTool } =
	storeToRefs(useToolSelection());
const { selectTool } = useToolSelection();
const { brushType, brushColor } = storeToRefs(usePen());
const { undoDisabled, redoDisabled } = storeToRefs(useDrawHistoryManager());
const { selectAction } = useDrawStore();
const { openMenu } = useMenuStore();

const undo = () => selectAction(DrawAction.Undo, undefined);
const redo = () => selectAction(DrawAction.Redo, undefined);

const penMenuIcon = computed(() =>
	lastSelectedPenMenuTool.value === DrawTool.Pen
		? penIconMapping[brushType.value]
		: mdiFormatColorFill,
);
</script>
