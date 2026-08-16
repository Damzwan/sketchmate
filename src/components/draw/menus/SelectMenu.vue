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

        <!-- Only meaningful once there is a second layer, and on a one-layer
             drawing it would be a switch that visibly does nothing. -->
        <ion-item v-if="hasMultipleLayers" color="tertiary" lines="none">
          <ion-icon :icon="svg(mdiLayersOutline)" />
          <p class="pl-2 text-base flex items-center gap-1 flex-1">
            <span>Multi-Layer Selection</span>
            <button
              class="flex items-center justify-center p-1 rounded-full cursor-pointer active:bg-black/5 transition-colors"
              aria-label="What does selecting across layers do?"
              @click.stop="openScopeInfo"
            >
              <ion-icon :icon="svg(mdiInformationOutline)" class="text-base text-black/50" />
            </button>
          </p>
          <ion-toggle
            slot="end"
            mode="ios"
            color="secondary"
            :checked="acrossLayers"
            aria-label="Select across layers"
            @ion-change="onScopeChange"
          />
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-popover>

  <!-- Controlled, NOT `trigger="…"`. Ionic resolves a trigger id exactly once,
       with `document.getElementById`, when the popover mounts — and the button
       above is behind `v-if="hasMultipleLayers"`, so on a single-layer document
       (which is the state at mount for almost every session) there is nothing
       to bind to and Ionic never looks again. Passing the click event directly
       removes the lookup, and with it the ordering dependency. -->
  <ion-popover
    :is-open="scopeInfoOpen"
    :event="scopeInfoEvent"
    class="cabin-sketch-regular"
    @did-dismiss="scopeInfoOpen = false"
  >
    <div class="p-4 text-black bg-background border border-primary/20 rounded-2xl">
      <p class="font-bold text-lg mb-1 border-b border-secondary/20 pb-1 text-secondary">
        Multi-Layer Selection
      </p>
      <p class="leading-snug">
        <span class="font-semibold">Off:</span> Selects objects on the active layer only.
      </p>
      <p class="leading-snug mt-1">
        <span class="font-semibold">On:</span> Selects across all visible, unlocked layers.
      </p>
    </div>
  </ion-popover>
</template>

<script lang="ts" setup>
import {
	IonContent,
	IonIcon,
	IonItem,
	IonList,
	IonPopover,
	IonToggle,
	popoverController,
} from "@ionic/vue";
import {
	mdiCursorDefaultClickOutline,
	mdiInformationOutline,
	mdiLasso,
	mdiLayersOutline,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, ref, shallowRef } from "vue";
import { useLayersStore } from "@/draw/layers/layers.store";
import {
	selectionScopeRef,
	setSelectionScope,
} from "@/draw/layers/selectionScope";
import { DrawTool, type SelectTool } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";

const { selectMenuOpen, menuEvent } = storeToRefs(useMenuStore());
const { selectTool } = useToolSelection();
const { layers } = storeToRefs(useLayersStore());

const hasMultipleLayers = computed(() => layers.value.length > 1);
const acrossLayers = computed(() => selectionScopeRef.value === "allLayers");

const scopeInfoOpen = ref(false);
// `shallowRef`: a DOM event is not reactive data and making it deeply reactive
// would have Vue walk the whole event object, target element included.
const scopeInfoEvent = shallowRef<Event | undefined>();

function openScopeInfo(event: Event) {
	// Anchors the popover to the ⓘ button. Without an event Ionic centres it on
	// the screen, which reads as an unrelated dialog rather than a note about
	// the row it came from.
	scopeInfoEvent.value = event;
	scopeInfoOpen.value = true;
}

function select(tool: SelectTool) {
	selectTool(tool);
	popoverController.dismiss();
}

function onScopeChange(event: CustomEvent) {
	// The menu stays open on purpose: this is a setting for the selection the
	// user is about to make, not a command, so dismissing on toggle would make
	// the switch feel like it did something else.
	setSelectionScope(
		(event.detail as { checked: boolean }).checked
			? "allLayers"
			: "activeLayer",
	);
}
</script>

<style scoped>
ion-list {
  padding: 0;
}
</style>
