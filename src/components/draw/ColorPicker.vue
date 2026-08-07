<template>
  <div class="picker_card" ref="hmm">

    <div class="flex items-center gap-1.5 w-full">
      <button type="button" class="current_row" :id="customColorPopoverId">
        <span class="current_chip" :style="{ backgroundColor: color }" />
        <div class="current_meta">
          <span class="current_hex">{{ displayHex }}</span>
          <span class="current_sub">Custom</span>
        </div>
        <ion-icon class="current_chevron" :icon="svg(mdiChevronRight)" />
      </button>

      <button type="button" class="eyedrop_btn" aria-label="Pick color from canvas" @click="pickColor">
        <ion-icon :icon="svg(mdiEyedropper)" />
      </button>
    </div>

    <template v-if="showOpacity && color">
      <div class="card_divider" />
      <div>
        <div class="control_row">
          <label class="section_label">Opacity</label>
          <span class="value_pill">{{ alphaHexToPercent(opacityHex) }}%</span>
        </div>
        <ion-range aria-label="Opacity" :value="alphaHexToPercent(opacityHex)"
                   @ionChange="(e: any) => emit('update:color', hexWithOpacity(c, percentToAlphaHex(e.target.value)))"
                   :min="0" :max="100" color="secondary" />
      </div>
    </template>

    <div class="card_divider" />

    <div>
      <label class="section_label">Palette</label>
      <div class="swatch_grid mt-1">
        <button v-for="(swatch, i) in flatSwatches" :key="'sw-' + i" type="button"
                class="swatch" :class="{ 'swatch--selected': isSelected(swatch) }"
                :style="{ backgroundColor: hexWithOpacity(swatch, opacityHex) }"
                @click="onColorSelect(swatch)" />
      </div>
    </div>

    <div v-if="colorHistory.length > 0">
      <label class="section_label">Recent</label>
      <div class="swatch_grid mt-1">
        <button v-for="(swatch, i) in colorHistory" :key="'hist-' + i" type="button"
                class="swatch" :class="{ 'swatch--selected': isSelected(swatch) }"
                :style="{ backgroundColor: hexWithOpacity(swatch, opacityHex) }"
                @click="onColorSelect(swatch)" />
        <span v-for="i in emptySpaces" :key="'empty-' + i" class="swatch_empty" />
      </div>
    </div>

    <div class="card_divider" />

    <div>
      <label class="section_label">Suggested</label>
      <div class="space-y-1.5 mt-1">
        <div v-for="(row, ri) in recommendations" :key="'rec-' + ri" class="swatch_grid">
          <button v-for="(swatch, ci) in row" :key="'rec-' + ri + '-' + ci" type="button"
                  class="swatch" :class="{ 'swatch--selected': isSelected(swatch) }"
                  :style="{ backgroundColor: swatch }"
                  @click="onColorSelect(swatch)" />
        </div>
      </div>
    </div>

    <ion-popover :trigger="customColorPopoverId" :keep-contents-mounted="true" side="top"
                 @willPresent="() => props.color ? picker.setColor(props.color) : null">
      <div ref="customColorParent" class="bg-primary"></div>
    </ion-popover>
  </div>
</template>

<script lang="ts" setup>
import { Preferences } from "@capacitor/preferences";
import { IonIcon, IonPopover, IonRange, popoverController } from "@ionic/vue";
import { mdiChevronRight, mdiEyedropper } from "@mdi/js";
import { storeToRefs } from "pinia";
import { v4 as uuidv4 } from "uuid";
import Picker from "vanilla-picker";
import { computed, onMounted, ref, watch } from "vue";
import { DrawAction } from "@/draw/actions/drawAction.types";
import { useDrawEventManager } from "@/draw/canvas/drawEventManager";
import { BLACK, COLORSWATCHES } from "@/draw/config/canvas.config";
import { ERASERS, PENMENUTOOLS } from "@/draw/config/tools.config";
import { useDrawStore } from "@/draw/session/draw.store";
import { exitColorPickerMode } from "@/draw/tools/colorActions";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";
import {
	alphaHexToPercent,
	getColorRecommendations,
	hexWithOpacity,
	hexWithoutOpacity,
	percentToAlphaHex,
} from "@/draw/utils/color.utils";
import { isMobile, svg } from "@/helper/general.helper";
import { LocalStorage } from "@/types/storage.types";

const hmm = ref();
const customColorPopoverId = uuidv4();
const customColorParent = ref();
const colorHistory = ref<string[]>([]);
const emptySpaces = computed(() => Math.max(0, 6 - colorHistory.value.length));

let picker: any;

getSavedColorHistory();

onMounted(() => {
	picker = new Picker({
		parent: customColorParent.value,
		popup: false,
		alpha: false,
		editor: false,
		color: props.color,
		onDone: async (c) => {
			onColorSelect(c.hex);
			hmm.value.click();
		},
	});
});

const props = defineProps<{
	color?: string;
	reset?: boolean;
	showOpacity?: boolean;
	colorPickerAction?: DrawAction;
}>();

const emit = defineEmits(["update:color"]);

const c = computed(() => props?.color || BLACK);
const opacityHex = computed(() =>
	c.value.substring(7, 9) != "" ? c.value.substring(7, 9) : "FF",
);

const flatSwatches = computed(() => COLORSWATCHES.flat());
const recommendations = computed(() => getColorRecommendations(c.value));
const displayHex = computed(() => hexWithoutOpacity(c.value).toUpperCase());

const isSelected = (swatch: string): boolean =>
	props.color === hexWithOpacity(swatch, opacityHex.value);

function getSavedColorHistory() {
	Preferences.get({ key: LocalStorage.color_history }).then(
		(res) => (colorHistory.value = res.value ? JSON.parse(res.value) : []),
	);
}

/**
 * Handles explicit selection of any color across all sections
 * Tracks unified usage history cleanly.
 */
async function onColorSelect(newColor: string) {
	newColor = hexWithoutOpacity(newColor).toUpperCase();
	emit("update:color", hexWithOpacity(newColor, opacityHex.value));

	// Remove existing occurrence to cycle duplicates to the front
	colorHistory.value = colorHistory.value.filter((h) => h !== newColor);
	colorHistory.value.unshift(newColor);

	if (colorHistory.value.length > 6) colorHistory.value.pop();
	Preferences.set({
		key: LocalStorage.color_history,
		value: JSON.stringify(colorHistory.value),
	});
}

function pickColor(e: any) {
	const { getCanvas, selectAction } = useDrawStore();
	const { activateExclusiveEvents } = useDrawEventManager();
	const { selectedTool } = useToolSelection();
	const { colorPickerMode } = storeToRefs(useDrawUIStore());
	const c = getCanvas();

	const lastSelectedObject = c.getActiveObject();
	colorPickerMode.value = true;

	c.selection = false;
	c.skipTargetFind = true;

	if (PENMENUTOOLS.includes(selectedTool) || ERASERS.includes(selectedTool)) {
		c.isDrawingMode = false;
	}

	function updateColorIndicator(
		color: string,
		e?: any,
		size = isMobile() ? 80 : 32,
	) {
		const zoom = c.getZoom();
		const adjustedSize = size * zoom;

		if (!isMobile()) {
			const canvas = document.createElement("canvas");
			canvas.width = adjustedSize;
			canvas.height = adjustedSize;
			const ctx = canvas.getContext("2d")!;

			const center = adjustedSize / 2;
			const radius = adjustedSize / 2 - 1;

			ctx.beginPath();
			ctx.arc(center, center, radius, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.fill();

			ctx.strokeStyle = "#000";
			ctx.lineWidth = 2;
			ctx.stroke();

			ctx.lineWidth = 2;
			ctx.strokeStyle = "#000";
			ctx.beginPath();
			ctx.moveTo(center, 0);
			ctx.lineTo(center, adjustedSize);
			ctx.moveTo(0, center);
			ctx.lineTo(adjustedSize, center);
			ctx.stroke();

			ctx.lineWidth = 1;
			ctx.strokeStyle = "#fff";
			ctx.beginPath();
			ctx.moveTo(center, 0);
			ctx.lineTo(center, adjustedSize);
			ctx.moveTo(0, center);
			ctx.lineTo(adjustedSize, center);
			ctx.stroke();

			const url = canvas.toDataURL("image/png");
			c.freeDrawingCursor = `url(${url}) ${center} ${center}, crosshair`;
			c.setCursor(c.freeDrawingCursor);
		} else if (e) {
			const pointer = e.pointer;
			const ctx = c.contextTop;

			ctx.clearRect(0, 0, c.width, c.height);

			const offsetY = -60 * zoom;
			const centerX = pointer.x;
			const centerY = pointer.y + offsetY;
			const radius = adjustedSize / 2;

			ctx.beginPath();
			ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
			ctx.strokeStyle = "#000";
			ctx.lineWidth = 3;
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
			ctx.strokeStyle = "#fff";
			ctx.lineWidth = 1.5;
			ctx.stroke();

			ctx.beginPath();
			ctx.arc(centerX, centerY, radius - 2, 0, 2 * Math.PI);
			ctx.fillStyle = color;
			ctx.fill();
		}
	}

	activateExclusiveEvents([
		{
			on: "mouse:up",
			handler: (options: any) => {
				exitColorPickerMode({ lastSelectedObjectRef: lastSelectedObject });
				const pointer = c.getViewportPoint(options.e);

				const dpr = window.devicePixelRatio || 1;
				const ctx = c.getContext();
				const pixel = ctx.getImageData(
					pointer.x * dpr,
					pointer.y * dpr,
					1,
					1,
				).data;

				const hex =
					"#" +
					((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2])
						.toString(16)
						.slice(1)
						.toUpperCase() +
					pixel[3].toString(16).toUpperCase().padStart(2, "0");

				onColorSelect(hex);
				if (props.colorPickerAction)
					selectAction(props.colorPickerAction, { color: hex });

				c.freeDrawingCursor = "default";

				if (c.contextTop) {
					c.contextTop.clearRect(0, 0, c.width, c.height);
				}
			},
		},
		{
			on: "mouse:move",
			handler: (options: any) => {
				const pointer = c.getViewportPoint(options.e);
				const dpr = window.devicePixelRatio || 1;
				const ctx = c.getContext();
				const pixel = ctx.getImageData(
					pointer.x * dpr,
					pointer.y * dpr,
					1,
					1,
				).data;
				const color = `rgba(${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3] / 255})`;
				updateColorIndicator(color, options);
			},
		},
	]);

	popoverController.dismiss();
}

watch(props, async () => {
	if (props.reset) getSavedColorHistory();
});
</script>

<style scoped>
@reference "@/theme/main.css";

.picker_card {
  @apply bg-background border border-black/5 rounded-[1.75rem] p-3 space-y-2.5;
}

.section_label {
  @apply block text-[10px] font-black uppercase tracking-widest text-black/70;
}

.card_divider {
  @apply h-px bg-black/5;
}

.control_row {
  @apply flex items-center justify-between mb-0.5;
}

.value_pill {
  @apply text-[11px] font-black text-secondary bg-secondary/10 px-2 py-0.5 rounded-full tabular-nums;
}

/* ─── Layout Actions ───────────────────────────────────────────────────────── */
.current_row {
  @apply flex-1 flex items-center gap-2.5 p-1.5 rounded-xl bg-black/5 ring-1 ring-black/5
  active:scale-[0.99] transition-transform cursor-pointer text-left min-w-0;
}

.current_chip {
  @apply w-7 h-7 rounded-lg ring-1 ring-black/10 shrink-0;
}

.current_meta {
  @apply flex flex-col min-w-0 leading-tight;
}

.current_hex {
  @apply text-xs font-black text-black/70 tabular-nums uppercase truncate;
}

.current_sub {
  @apply text-[9px] uppercase tracking-wider text-black/45;
}

.current_chevron {
  @apply ml-auto text-black/25 text-base shrink-0 pr-0.5;
}

.eyedrop_btn {
  @apply w-10 h-10 rounded-xl flex items-center justify-center shrink-0
  bg-secondary/10 text-secondary active:scale-90 transition-transform;
}

.eyedrop_btn ion-icon {
  @apply w-4 h-4;
}

/* ─── Tighter Swatch Matrix ────────────────────────────────────────────────── */
.swatch_grid {
  @apply grid grid-cols-6 gap-1.5;
}

.swatch {
  @apply w-full aspect-square rounded-full ring-1 ring-black/5
  transition-all duration-150 active:scale-90 cursor-pointer;
}

.swatch--selected {
  @apply ring-2 ring-secondary ring-offset-2 ring-offset-background scale-105;
}

.swatch_empty {
  @apply w-full aspect-square rounded-full border border-dashed border-black/10;
}

ion-range {
  --bar-height: 4px;
  --bar-border-radius: 8px;
  --bar-background: rgba(0, 0, 0, 0.08);
  --bar-background-active: var(--ion-color-secondary);
  --knob-size: 18px;
  --knob-background: #fff;
  --knob-box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);
  padding: 2px 2px;
}
</style>

<style>
@reference "@/theme/main.css";

.picker_wrapper {
  background: var(--ion-color-tertiary)
}

.picker_selector {
  border: 2px solid var(--ion-color-primary)
}

.picker_done button {
  background-image: none !important;
  @apply bg-primary rounded-md hover:bg-primary-shade
}
</style>
