<template>
  <!-- Bottom-right corner. Rendered inside the draw page (NOT teleported) for
       the same reason as SelectionPreview: it must stay under SendHub / RoomMenu
       / ChatWidget in the page's stacking context. -->
  <button
    class="fixed z-40 pointer-events-auto cursor-pointer max-w-[9rem] h-10 flex items-center gap-1.5 pl-2 pr-2.5 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md shadow-lg active:scale-95 transition-all"
    :style="{
      right: 'calc(0.75rem + env(safe-area-inset-right))',
      bottom: 'calc(9rem + env(safe-area-inset-bottom))',
    }"
    :aria-label="`Layers — drawing on ${activeLayerName}`"
    @click="open()"
  >
    <ion-icon
      :icon="svg(mdiLayersTripleOutline)"
      class="w-6 h-6 shrink-0 text-black"
    />
    <!-- Which layer the next stroke lands on, and how many exist. Without this
         the active layer is invisible state and every stroke is a guess. -->
    <span class="flex flex-col items-start leading-none min-w-0 text-black">
      <span class="text-[11px] font-black truncate max-w-[5.5rem]">
        {{ activeLayerName }}
      </span>
      <span class="text-[9px] font-bold">{{ layerCountLabel }}</span>
    </span>
    <span
      v-if="hiddenCount > 0"
      class="absolute -top-1 -right-1 bg-secondary text-white text-[10px] font-black w-4 h-4 flex items-center justify-center rounded-full shadow-md border border-white/40 pointer-events-none"
    >
      {{ hiddenCount }}
    </span>
  </button>

  <!-- Mounted only while open: an always-mounted sheet keeps its rows (and their
       watchers) alive on a device that has no spare memory for them. -->
  <BaseSheetModal
    v-if="mounted"
    :is-open="isOpen"
    title="Layers"
    :subtitle="policy === 'fixed' ? 'Shared room · fixed layers' : undefined"
    @close="isOpen = false"
    @present="refreshCounts"
  >
    <div class="flex flex-col gap-2">
      <!-- Top of the list is the TOP of the drawing, like every other layer UI. -->
      <div
        v-for="(layer, index) in reversedLayers"
        :key="layer.id"
        class="flex items-center gap-2 rounded-2xl border px-2 py-2 transition-colors"
        :class="layer.id === activeId
          ? 'border-secondary bg-secondary/10'
          : 'border-primary/40 bg-primary/10'"
      >
        <button
          class="flex-1 min-w-0 text-left cursor-pointer disabled:opacity-40"
          :disabled="layer.locked || !layer.visible"
          @click="setActive(layer.id)"
        >
          <p class="font-bold truncate leading-tight">{{ layer.name }}</p>
          <p class="text-xs opacity-60 leading-tight">
            {{ counts[layer.id] ?? 0 }} object{{ counts[layer.id] === 1 ? '' : 's' }}
            <span v-if="layer.id === activeId"> · drawing here</span>
          </p>
        </button>

        <ToolButton
          :icon="svg(layer.visible ? mdiEyeOutline : mdiEyeOffOutline)"
          :icon-class="layer.visible ? 'text-black' : 'text-black/40'"
          :aria-label="layer.visible ? 'Hide layer' : 'Show layer'"
          @click="layers.setVisible(layer.id, !layer.visible)"
        />
<!--        <ToolButton-->
<!--          :icon="svg(layer.locked ? mdiLockOutline : mdiLockOpenVariantOutline)"-->
<!--          :icon-class="layer.locked ? 'text-black' : 'text-black/40'"-->
<!--          :aria-label="layer.locked ? 'Unlock layer' : 'Lock layer'"-->
<!--          @click="layers.setLocked(layer.id, !layer.locked)"-->
<!--        />-->

        <!-- Structural controls only on the row you are editing: six 40px
             buttons per row does not fit a phone. -->
        <template v-if="canEditStructure && layer.id === activeId">
          <ToolButton
            :icon="svg(mdiPencilOutline)"
            aria-label="Rename layer"
            @click="rename(layer.id)"
          />
          <ToolButton
            :icon="svg(mdiChevronUp)"
            :disabled="index === 0"
            aria-label="Move layer up"
            @click="moveUp(layer.id)"
          />
          <ToolButton
            :icon="svg(mdiChevronDown)"
            :disabled="index === reversedLayers.length - 1"
            aria-label="Move layer down"
            @click="moveDown(layer.id)"
          />
        </template>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-col gap-2">
        <ion-button
          v-if="hasSelection"
          expand="block"
          fill="outline"
          color="secondary"
          @click="moveSelection"
        >
          Move selection to {{ activeLayerName }}
        </ion-button>

        <div v-if="canEditStructure" class="flex gap-2">
          <ion-button
            expand="block"
            class="flex-1"
            color="secondary"
            shape="round"
            :disabled="!canAddLayer"
            @click="add"
          >
            <ion-icon :icon="svg(mdiPlus)" slot="start" />
            Add layer
          </ion-button>
          <ion-button
            expand="block"
            class="flex-1"
            color="danger"
            fill="outline"
            shape="round"
            :disabled="!canDeleteLayer"
            @click="remove"
          >
            <ion-icon :icon="svg(mdiTrashCanOutline)" slot="start" />
            Delete
          </ion-button>
        </div>
        <p v-else class="text-xs text-center opacity-60">
          Everyone in the room shares the same layers, so they can't be added or removed.
        </p>
      </div>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { IonButton, IonIcon, alertController } from "@ionic/vue";
import {
	mdiChevronDown,
	mdiChevronUp,
	mdiEyeOffOutline,
	mdiEyeOutline,
	mdiLayersTripleOutline,
	mdiLockOpenVariantOutline,
	mdiLockOutline,
	mdiPencilOutline,
	mdiPlus,
	mdiTrashCanOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import ToolButton from "@/components/draw/toolbar/ToolButton.vue";
import { useLayersStore } from "@/draw/layers/layers.store";
import { useSelect } from "@/draw/tools/select.store";

const layers = useLayersStore();
const {
	layers: layerList,
	activeId,
	policy,
	canEditStructure,
	canAddLayer,
	canDeleteLayer,
} = storeToRefs(layers);

const isOpen = ref(false);
const mounted = ref(false);

/**
 * The app's OWN selection, not `canvas.getActiveObjects()`.
 *
 * That distinction is the whole bug: the select tool keeps `selectedObjectsRef`
 * and fabric's active object is discarded on plenty of paths that leave the
 * user's selection conceptually intact (opening an overlay, `actionWithoutEvents`
 * flows, multi-select rebuilds). Reading fabric's copy meant the move ran
 * against an empty list and silently did nothing. This ref is also reactive, so
 * the footer button appears and disappears correctly instead of being sampled
 * once when the sheet opened.
 */
const { selectedObjectsRef } = storeToRefs(useSelect());
const hasSelection = computed(() => selectedObjectsRef.value.length > 0);

/**
 * Object counts are O(scene) per layer, so they are sampled ONCE when the sheet
 * opens rather than living in a computed that any canvas mutation would
 * re-evaluate. The number is informational; a stale one costs nothing.
 */
const counts = ref<Record<string, number>>({});

const reversedLayers = computed(() => [...layerList.value].reverse());
const hiddenCount = computed(
	() => layerList.value.filter((l) => !l.visible).length,
);
const activeLayerName = computed(
	() => layerList.value.find((l) => l.id === activeId.value)?.name ?? "layer",
);
const layerCountLabel = computed(
	() =>
		`${layerList.value.length} layer${layerList.value.length === 1 ? "" : "s"}`,
);

function refreshCounts() {
	const next: Record<string, number> = {};
	for (const layer of layerList.value)
		next[layer.id] = layers.objectCount(layer.id);
	counts.value = next;
}

function open() {
	mounted.value = true;
	refreshCounts();
	isOpen.value = true;
}

function setActive(id: string) {
	layers.setActive(id);
}

function moveUp(id: string) {
	const index = layerList.value.findIndex((l) => l.id === id);
	if (index < layerList.value.length - 1) layers.moveLayer(index, index + 1);
}

function moveDown(id: string) {
	const index = layerList.value.findIndex((l) => l.id === id);
	if (index > 0) layers.moveLayer(index, index - 1);
}

function add() {
	layers.addLayer();
	refreshCounts();
}

async function remove() {
	const count = counts.value[activeId.value] ?? 0;
	const alert = await alertController.create({
		header: "Delete layer",
		cssClass: "liquid-alert",
		message: count
			? `${activeLayerName.value} and its ${count} object${count === 1 ? "" : "s"} will be removed. You can undo this.`
			: `${activeLayerName.value} will be removed. You can undo this.`,
		buttons: [
			{ text: "Cancel", role: "cancel" },
			{ text: "Delete", role: "destructive" },
		],
	});
	await alert.present();
	const { role } = await alert.onDidDismiss();
	if (role !== "destructive") return;
	// Clear first: the selection can hold objects this delete is about to remove,
	// and a selection of detached objects renders controls for things that are no
	// longer in the scene.
	useSelect().unSelect();
	layers.deleteLayer(activeId.value);
	refreshCounts();
}

function moveSelection() {
	// Canvas selection is the source of truth for WHAT to move; the select
	// store's ref only drives whether the button is offered (it is reactive,
	// fabric's is not). If the canvas selection is somehow empty, fall back to
	// the store's copy rather than doing nothing.
	if (layers.moveSelectionToLayer(activeId.value) === 0) {
		layers.moveObjectsToLayer([...selectedObjectsRef.value], activeId.value);
	}
	useSelect().unSelect();
	refreshCounts();
}

async function rename(id: string) {
	const layer = layerList.value.find((l) => l.id === id);
	if (!layer) return;
	const alert = await alertController.create({
		header: "Rename layer",
		cssClass: "liquid-alert",
		inputs: [
			{
				name: "name",
				type: "text",
				value: layer.name,
				attributes: { maxlength: 24 },
			},
		],
		buttons: [
			{ text: "Cancel", role: "cancel" },
			{ text: "Save", role: "confirm" },
		],
	});
	await alert.present();
	const { role, data } = await alert.onDidDismiss();
	if (role !== "confirm") return;
	const name = String(data?.values?.name ?? "").trim();
	if (name) layers.renameLayer(id, name);
}
</script>
