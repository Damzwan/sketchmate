<template>
  <!-- Bottom-right corner. Rendered inside the draw page (NOT teleported) so it
       stays under SendHub / RoomMenu / ChatWidget in the page's stacking context. -->
  <button
    class="fixed z-40 pointer-events-auto cursor-pointer max-w-[9rem] h-10 flex items-center gap-1.5 pl-2 pr-2.5 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md shadow-lg active:scale-95 transition-all"
    :style="{
      right: 'calc(0.75rem + env(safe-area-inset-right))',
      bottom: 'calc(6rem + env(safe-area-inset-bottom))',
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
    :subtitle="subtitle"
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
          :disabled="layer.locked"
          @click="setActive(layer.id)"
        >
          <p class="font-bold truncate leading-tight">{{ layer.name }}</p>
          <p class="text-xs leading-tight">
            {{ counts[layer.id] ?? 0 }} object{{ counts[layer.id] === 1 ? '' : 's' }}
            <span v-if="layer.id === activeId" class="text-secondary"> · drawing here</span>
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

        <!-- Keep these controls mounted in every editable row. Conditional
             mounting shifted the eye button after a quick layer switch, so a
             second tap could hit a different action than the user's muscle
             memory expected. Inactive rows are simply disabled. -->
        <template v-if="canEditStructure">
          <ToolButton
            :icon="svg(mdiPencilOutline)"
            :disabled="layer.id !== activeId"
            aria-label="Rename layer"
            @click="rename(layer.id)"
          />
          <ToolButton
            :icon="svg(mdiChevronUp)"
            :disabled="layer.id !== activeId || index === 0"
            aria-label="Move layer up"
            @click="moveUp(layer.id)"
          />
          <ToolButton
            :icon="svg(mdiChevronDown)"
            :disabled="layer.id !== activeId || index === reversedLayers.length - 1"
            aria-label="Move layer down"
            @click="moveDown(layer.id)"
          />
          <!-- Merge the layer down to a single image. Offered per row because it
               is a property of THAT layer's weight, not of the active one. -->
          <ToolButton
            :icon="svg(mdiImageSyncOutline)"
            :disabled="flattening || (counts[layer.id] ?? 0) < 2"
            aria-label="Flatten layer to an image"
            @click="flatten(layer.id)"
          />
        </template>
      </div>
    </div>

    <template #footer>
      <div class="flex flex-col gap-2">
        <ion-button
          v-if="canMoveSelection"
          expand="block"
          shape="round"
          fill="outline"
          color="secondary"
          :class="{ invisible: !canMoveSelection }"
          @click="moveSelection"
        >
          Move selection to {{ activeLayerName }}
        </ion-button>

        <div v-if="canEditStructure" class="flex gap-2">
          <!-- At the TIER limit this button goes straight to the paywall rather
               than sitting disabled — a dead control teaches nothing, and the
               paywall already explains itself. At the hard cap there is nothing
               to sell, so it does disable. -->
          <ion-button
            expand="block"
            class="flex-1"
            :color="atTierLimit ? 'warning' : 'secondary'"
            shape="round"
            :disabled="!canAddLayer && !atTierLimit"
            @click="atTierLimit ? upgrade() : add()"
          >
            <ion-icon
              :icon="svg(atTierLimit ? mdiStar : mdiPlus)"
              slot="start"
            />
            {{ atTierLimit ? "More layers" : "Add layer" }}
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
          Public lobbies share one fixed set of layers, so they can't be added or removed.
        </p>
        <p v-if="canEditStructure" class="text-[11px] text-center opacity-60">
          {{ layerList.length }} of {{ maxLayers }} layers used<span v-if="atTierLimit">
            · Pro gets {{ maxPro }}</span>
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
	mdiImageSyncOutline,
	mdiLayersTripleOutline,
	mdiLockOpenVariantOutline,
	mdiLockOutline,
	mdiPencilOutline,
	mdiPlus,
	mdiStar,
	mdiTrashCanOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import ToolButton from "@/components/draw/toolbar/ToolButton.vue";
import { useLayersStore } from "@/draw/layers/layers.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { BASE_LAYER_ID, MAX_SOLO_LAYERS } from "@/draw/layers/layer.types";
import { useSelect } from "@/draw/tools/select.store";

const layers = useLayersStore();
const {
	layers: layerList,
	activeId,
	policy,
	canEditStructure,
	canAddLayer,
	canDeleteLayer,
	shared,
	maxLayers,
	atTierLimit,
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
 * against an empty list and silently did nothing. This ref is reactive, so the
 * reserved footer action slot immediately reflects the current selection and
 * destination layer instead of being sampled once when the sheet opens.
 */
const { selectedObjectsRef } = storeToRefs(useSelect());
const canMoveSelection = computed(() =>
	selectedObjectsRef.value.some(
		(object) => ((object as any).layerId ?? BASE_LAYER_ID) !== activeId.value,
	),
);

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
const maxPro = MAX_SOLO_LAYERS;

const subtitle = computed(() => {
	if (policy.value === "fixed") return "Public lobby · fixed layers";
	return shared.value ? "Shared with the room" : undefined;
});
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

const flattening = ref(false);

/**
 * Flattening trades editability for weight: N indexed, serialized, baked objects
 * become one image. Irreversible except through undo, so it asks first and says
 * so plainly.
 */
async function flatten(id: string) {
	const layer = layerList.value.find((l) => l.id === id);
	if (!layer || flattening.value) return;
	const count = counts.value[id] ?? 0;
	const alert = await alertController.create({
		header: "Flatten layer",
		cssClass: "liquid-alert",
		message: `${layer.name}'s ${count} object${count === 1 ? "" : "s"} become one image. Faster to draw on, but you can no longer edit the individual strokes.${shared.value ? " This changes the layer for everyone in the room." : ""} You can undo this.`,
		buttons: [
			{ text: "Cancel", role: "cancel" },
			{ text: "Flatten", role: "confirm" },
		],
	});
	await alert.present();
	const { role } = await alert.onDidDismiss();
	if (role !== "confirm") return;

	// The selection can hold objects the flatten is about to remove.
	useSelect().unSelect();
	flattening.value = true;
	try {
		await layers.flattenLayer(id);
	} finally {
		flattening.value = false;
		refreshCounts();
	}
}

function upgrade() {
	isOpen.value = false;
	useSubscriptionStore().openPaywall();
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
