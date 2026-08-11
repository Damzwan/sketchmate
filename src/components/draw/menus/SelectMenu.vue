<template>
  <ion-popover
    :keepContentsMounted="true"
    :showBackdrop="false"
    :is-open="selectMenuOpen"
    :event="menuEvent"
    @didDismiss="() => (selectMenuOpen = false)"
  >
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" :detail="true" @click="select(DrawTool.Select)">
          <ion-icon :icon="svg(mdiCursorDefaultClickOutline)" />
          <p class="pl-2 text-base">Select</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" :detail="true" @click="select(DrawTool.Lasso)">
          <ion-icon :icon="svg(mdiLasso)" />
          <p class="pl-2 text-base">Lasso</p>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import {
	IonContent,
	IonIcon,
	IonItem,
	IonList,
	IonPopover,
	popoverController,
} from "@ionic/vue";
import { mdiCursorDefaultClickOutline, mdiLasso } from "@mdi/js";
import { storeToRefs } from "pinia";
import { DrawTool, type SelectTool } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";

const { selectMenuOpen, menuEvent } = storeToRefs(useMenuStore());
const { selectTool } = useToolSelection();

function select(tool: SelectTool) {
	selectTool(tool);
	popoverController.dismiss();
}
</script>

<style scoped>
ion-list {
  padding: 0;
}
</style>
