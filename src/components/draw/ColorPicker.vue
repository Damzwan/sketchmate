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
import { IonIcon, IonPopover, IonRange } from "@ionic/vue";
import { mdiChevronRight, mdiEyedropper } from "@mdi/js";
import Picker from "vanilla-picker";
import { computed, onMounted, ref, watch } from "vue";
import { DrawAction } from "@/draw/actions/drawAction.types";
import { BLACK, COLORSWATCHES } from "@/draw/config/canvas.config";
import {
	alphaHexToPercent,
	getColorRecommendations,
	hexWithOpacity,
	hexWithoutOpacity,
	percentToAlphaHex,
} from "@/draw/utils/color.utils";
import { svg } from "@/helper/general.helper";
import { LocalStorage } from "@/types/storage.types";
import { uuidv4 } from "@/utils/uuid";
import { useCanvasEyedropper } from "./useCanvasEyedropper";

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
const { pickColor } = useCanvasEyedropper(
	onColorSelect,
	() => props.colorPickerAction,
);

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
