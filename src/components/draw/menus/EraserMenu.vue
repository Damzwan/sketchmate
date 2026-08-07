<template>
  <ion-popover
    :is-open="eraserMenuOpen"
    :event="menuEvent"
    @didDismiss="close"
    :keepContentsMounted="true"
    :showBackdrop="false"
    class="draw-menu-popover"
    side="top" alignment="center"
  >
    <div class="draw-menu bg-tertiary border border-primary/20">
      <div class="draw-menu-body hide-scrollbar">

        <div class="control_card shadow-sm">
          <div class="control_row">
            <label class="control_label">Size</label>
            <ion-range
              aria-label="Eraser Size"
              v-model="eraserSize"
              :min="0.5"
              :step="0.5"
              :max="150"
              color="secondary"
            />
            <span class="value_pill">{{ eraserSize }}</span>
          </div>

          <div class="card_divider"></div>

          <button class="action_button" @click="clearAll">
            <ion-icon :icon="svg(mdiNuke)" class="text-base" />
            <span>Clear all</span>
          </button>
        </div>

      </div>
    </div>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonIcon, IonPopover, IonRange } from "@ionic/vue";
import { mdiNuke } from "@mdi/js";
import { storeToRefs } from "pinia";
import { DrawAction } from "@/draw/actions/drawAction.types";
import { useDrawStore } from "@/draw/session/draw.store";
import { useEraser } from "@/draw/tools/eraser.store";
import { DrawTool, EraserSize } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";

const drawStore = useDrawStore();
const { selectTool } = useToolSelection();
const { eraserSize } = storeToRefs(useEraser());
const { eraserMenuOpen, menuEvent } = storeToRefs(useMenuStore());

function clearAll() {
	drawStore.selectAction(DrawAction.FullErase, undefined);
	close();
}

function selectEraserSize(size: EraserSize) {
	eraserSize.value = size;
}

function selectEraser() {
	selectTool(DrawTool.MobileEraser);
	close();
}

function close() {
	eraserMenuOpen.value = false;
}
</script>

<style scoped>
@reference "@/theme/main.css";

/* Shell, control rows, range and scrollbar tokens are shared across the tool
   menus — see src/theme/draw-menu.css. Only the destructive action is local. */

.action_button {
  @apply w-full flex items-center justify-center gap-1.5 py-2 rounded-xl
  bg-red-500/10 text-red-500 font-bold text-xs
  active:scale-95 transition-transform cursor-pointer border-0;
}
</style>
