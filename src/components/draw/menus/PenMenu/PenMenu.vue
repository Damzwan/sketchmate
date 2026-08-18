<template>
  <ion-popover
    :is-open="penMenuOpen"
    :event="menuEvent"
    @didDismiss="onDismiss"
    :keepContentsMounted="true"
    :showBackdrop="false"
    class="draw-menu-popover"
    side="top" alignment="center"
  >
    <div class="draw-menu bg-tertiary border border-primary/20">

      <div class="draw-menu-head">
        <div ref="preview_stage" class="preview-stage bg-[#FAF8F5] border border-primary/10">
          <canvas ref="preview_canvas"></canvas>
          <span class="preview-tag">Preview</span>
        </div>

        <!-- Unlock CTA sits BELOW the preview so the brush stroke stays fully
             visible — the user can see what they're buying.

             While a trial still has strokes left the brush is SELECTED, not
             previewed, so this banner reports what is left and offers the
             upgrade instead of blocking. -->
        <button
          v-if="trialBrush"
          type="button"
          class="unlock-banner cabin-sketch-regular"
          :disabled="purchasing"
          @click="buyBrush(trialBrush)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <ion-icon :icon="svg(mdiCreation)" class="text-base shrink-0" />
            <span class="text-xs font-black tracking-tight truncate">
              {{ purchasing
                ? 'Unlocking…'
                : `Trying ${brushDisplayName(trialBrush)} · ${trialStrokesLeft} left today` }}
            </span>
          </div>
          <ion-icon :icon="svg(mdiArrowRight)" class="text-base shrink-0 ml-2" />
        </button>

        <!-- Locked: either never tried, or the day's trial is spent. The second
             case says so, because "Unlock Calligraphy" on a brush that worked a
             minute ago reads as a bug rather than as a limit. -->
        <button
          v-else-if="previewedLockedBrush"
          type="button"
          class="unlock-banner cabin-sketch-regular"
          :disabled="purchasing"
          @click="buyBrush(previewedLockedBrush)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <ion-icon :icon="svg(mdiLock)" class="text-base shrink-0" />
            <span class="text-xs font-black tracking-tight truncate">
              {{ purchasing
                ? 'Unlocking…'
                : `${trialSpent(previewedLockedBrush) ? 'Trial used up · ' : ''}Unlock ${brushDisplayName(previewedLockedBrush)}` }}
            </span>
          </div>
          <ion-icon :icon="svg(mdiArrowRight)" class="text-base shrink-0 ml-2" />
        </button>
      </div>

      <div class="draw-menu-body hide-scrollbar">
        <!-- Labels are deliberately one word ("Width", not "Stroke Width") —
             that's what lets label, slider and value share a single row at
             phone width without the track collapsing. -->
        <div class="control_card shadow-sm">
          <div class="control_row">
            <label class="control_label">Width</label>
            <PrecisionRange
              v-model="brushSize"
              label="Stroke width"
              :min="0.1"
              :max="120"
              :step="0.1"
              :curve="STROKE_WIDTH_CURVE"
              :snap-value="snapStrokeWidth"
              :ticks="[1, 5, 20, 50]"
              :format-value="formatStrokeWidth"
            />
            <button
              v-if="!editingWidth"
              type="button"
              class="value_pill width-value-button"
              aria-label="Enter exact stroke width"
              @click="startWidthEdit"
            >
              <span>{{ formatStrokeWidth(brushSize) }}</span>
              <ion-icon :icon="svg(mdiPencilOutline)" aria-hidden="true" />
            </button>
            <input
              v-else
              ref="widthInput"
              v-model="widthDraft"
              class="value_pill width-value-input"
              aria-label="Exact stroke width"
              type="number"
              inputmode="decimal"
              min="0.1"
              max="120"
              step="0.1"
              @blur="commitWidthEdit"
              @keydown.enter.prevent="commitWidthEdit"
              @keydown.esc.prevent="cancelWidthEdit"
            />
          </div>

          <div class="control_row">
            <label class="control_label">Opacity</label>
            <ion-range aria-label="Opacity" v-model="opacity"
                       :min="0" :max="100" color="secondary" />
            <span class="value_pill">{{ opacity }}%</span>
          </div>

          <template v-if="brushType === BrushType.Spray">
            <div class="control_row">
              <label class="control_label">Density</label>
              <ion-range aria-label="Density" v-model="density"
                         :min="1" :max="100" color="secondary" />
              <span class="value_pill">{{ density }}</span>
            </div>

            <div class="control_row">
              <label class="control_label">Dot</label>
              <ion-range aria-label="Dot width" v-model="dotWidth"
                         :min="0.5" :max="5" color="secondary" />
              <span class="value_pill">{{ dotWidth }}</span>
            </div>
          </template>

          <template v-if="brushType === BrushType.Pixel">
            <div class="control_row">
              <label class="control_label">Pixel</label>
              <ion-range aria-label="Pixel size" v-model="pixelSize"
                         :min="3" :max="30" :step="1" color="secondary" />
              <span class="value_pill">{{ pixelSize }}</span>
            </div>
          </template>

          <div class="card_divider"></div>

          <!-- Swatch-only grid: with the names gone the tiles are square, so 5
               columns fits 9 brushes in 2 rows instead of 3. -->
          <div class="brush_grid">
            <BrushTile
              v-for="b in BRUSHES"
              :key="b.type"
              :type="b.type"
              :accent="b.accent"
              :selected="isBrushTypeSelected(b.type)"
              :owned="isBrushOwned(b.type)"
              :tryable="isBrushTryable(b.type)"
              :previewed="previewedLockedBrush === b.type"
              :label="brushTileName(b.type)"
              :icon-path="penIconMapping[b.type]"
              @tap="onBrushTap"
            />
          </div>
        </div>

        <!-- Smudge is a TOOL, not a brush: it has no colour, no opacity and no
             swatch, so it cannot sit in the grid above without breaking every
             control in this menu. It is reached from here because this is where
             people look for "things you drag across the canvas", and it takes
             over the dock's pen slot once selected. -->
        <button v-if="SMUDGE_ENABLED" type="button" class="smudge_launcher" @click="openSmudge">
          <div class="smudge_launcher_icon">
            <ion-icon :icon="svg(SMUDGE_ICON)" aria-hidden="true" />
          </div>
          <div class="min-w-0 text-left">
            <p class="smudge_launcher_title">Smudge</p>
            <p class="smudge_launcher_sub">Blend colours already on the canvas</p>
          </div>
          <ion-icon class="smudge_launcher_chevron" :icon="svg(mdiChevronRight)" aria-hidden="true" />
        </button>

        <ColorPicker v-model:color="brushColor" :reset="penMenuOpen" />
      </div>
    </div>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonIcon, IonPopover, IonRange } from "@ionic/vue";
import {
	mdiArrowRight,
	mdiChevronRight,
	mdiCreation,
	mdiLock,
	mdiPencilOutline,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import ColorPicker from "@/components/draw/ColorPicker.vue";
import { useUnlockItem } from "@/composables/shop/useUnlockItem";
import { brushDisplayName, brushItemId } from "@/draw/config/paidBrushes";
import {
	PENMENUTOOLS,
	penIconMapping,
	SMUDGE_ENABLED,
	SMUDGE_ICON,
} from "@/draw/config/tools.config";
import { useBrushTrial } from "@/draw/tools/brushTrial.store";
import { usePen } from "@/draw/tools/pen.store";
import { BrushType, DrawTool } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { svg } from "@/helper/general.helper";
import { useInventoryStore } from "@/store/inventory.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import BrushTile from "./BrushTile.vue";
import PrecisionRange from "./PrecisionRange.vue";
import { STROKE_WIDTH_CURVE, snapStrokeWidth } from "./precisionRange";
import { usePenBrushPreview } from "./usePenBrushPreview";

const { selectTool } = useToolSelection();
const { selectedTool } = storeToRefs(useToolSelection());
const {
	brushSize,
	brushColor,
	brushType,
	opacity,
	density,
	dotWidth,
	pixelSize,
} = storeToRefs(usePen());
const { penMenuOpen, menuEvent } = storeToRefs(useMenuStore());
const { openMenu, closeMenu } = useMenuStore();
const inventoryStore = useInventoryStore();
const brushTrial = useBrushTrial();
const { purchasing, unlockItem } = useUnlockItem();
const editingWidth = ref(false);
const widthDraft = ref("");
const widthInput = ref<HTMLInputElement | null>(null);

function formatStrokeWidth(width: number): string {
	return Math.max(0.1, Math.min(120, width)).toFixed(1).replace(/\.0$/, "");
}

async function startWidthEdit() {
	widthDraft.value = formatStrokeWidth(brushSize.value);
	editingWidth.value = true;
	await nextTick();
	widthInput.value?.select();
}

function commitWidthEdit() {
	if (!editingWidth.value) return;
	const value = Number(widthDraft.value);
	if (Number.isFinite(value)) {
		brushSize.value = Math.round(Math.max(0.1, Math.min(120, value)) * 10) / 10;
	}
	editingWidth.value = false;
}

function cancelWidthEdit() {
	editingWidth.value = false;
}

const {
	previewCanvas: preview_canvas,
	previewStage: preview_stage,
	renderPreview,
} = usePenBrushPreview();

const BRUSHES: { type: BrushType; accent: string }[] = [
	{ type: BrushType.Pencil, accent: "text-green-600" },
	{ type: BrushType.WaterColor, accent: "text-rose-500" },
	{ type: BrushType.Spray, accent: "text-blue-500" },
	{ type: BrushType.Circle, accent: "text-amber-500" },
	{ type: BrushType.Pixel, accent: "text-emerald-500" },
	{ type: BrushType.Crayon, accent: "text-orange-500" },
	{ type: BrushType.Charcoal, accent: "text-neutral-600" },
	{ type: BrushType.Neon, accent: "text-indigo-500" },
	{ type: BrushType.CalliGraphy, accent: "text-sky-500" },
];

const BRUSH_NAMES: Partial<Record<BrushType, string>> = {
	[BrushType.Pencil]: "Pencil",
	[BrushType.WaterColor]: "Watercolor",
	[BrushType.Spray]: "Spray",
	[BrushType.Circle]: "Circle",
	[BrushType.Pixel]: "Pixel",
	[BrushType.Crayon]: "Crayon",
	[BrushType.Charcoal]: "Charcoal",
	[BrushType.Neon]: "Neon",
	[BrushType.CalliGraphy]: "Calligraphy",
};

const brushTileName = (type: BrushType): string => BRUSH_NAMES[type] ?? "Brush";

const isBrushOwned = (type: BrushType): boolean => {
	const id = brushItemId(type);
	if (!id) return true;
	return inventoryStore.isOwned(id);
};

const isBrushTryable = (type: BrushType): boolean => {
	const id = brushItemId(type);
	return !!id && !inventoryStore.isOwned(id) && brushTrial.canTry(id);
};

/** Locked AND already tried today — worth saying out loud on the CTA. */
const trialSpent = (type: BrushType): boolean => {
	const id = brushItemId(type);
	return !!id && !inventoryStore.isOwned(id) && !brushTrial.canTry(id);
};

const previewedLockedBrush = ref<BrushType | null>(null);

/**
 * The locked brush currently being TRIED — selected and drawable, on the day's
 * free stroke allowance.
 *
 * A locked brush that is merely previewed teaches nothing: Neon and Calligraphy
 * look like any other line in a canned swatch, and nobody buys a tool they have
 * never held. `brushTrial` hands out a handful of real strokes a day instead;
 * `pen.store` counts them and returns the pencil when they run out.
 */
const trialBrush = computed(() =>
	!isBrushOwned(brushType.value) &&
	selectedTool.value === DrawTool.Pen &&
	brushTrial.remaining(brushItemId(brushType.value) ?? "") > 0
		? brushType.value
		: null,
);

const trialStrokesLeft = computed(() =>
	trialBrush.value
		? brushTrial.remaining(brushItemId(trialBrush.value) ?? "")
		: 0,
);

// Buy the locked brush in place (same flow as FontModal / EffectModal via
// useUnlockItem) instead of bouncing the user out to the shop. On success the
// brush is owned, so select it immediately.
const buyBrush = async (type: BrushType) => {
	const id = brushItemId(type);
	if (!id) return;
	const ok = await unlockItem(id);
	if (ok) {
		previewedLockedBrush.value = null;
		selectBrushType(type);
	}
};

function onDismiss() {
	penMenuOpen.value = false;
	previewedLockedBrush.value = null;
	editingWidth.value = false;
}

/**
 * Hand over to the smudge tool: this menu closes, the smudge one opens.
 *
 * `skipOpenMenu` because `selectTool` would otherwise re-open the smudge menu
 * itself on the pen menu's anchor event, and the two would race over
 * `menuEvent`.
 */
function openSmudge() {
	closeMenu(Menu.Pen);
	selectTool(DrawTool.Smudge, { skipOpenMenu: true });
	openMenu(Menu.Smudge);
}

function selectBrushType(newBrushType: BrushType) {
	if (selectedTool.value != DrawTool.Pen) selectTool(DrawTool.Pen);
	brushType.value = newBrushType;
	renderPreview();
}

function isBrushTypeSelected(type: BrushType) {
	return brushType.value == type && selectedTool.value == DrawTool.Pen;
}

async function onBrushTap(type: BrushType) {
	// Owned, or the day's trial strokes are not spent: hand the brush over.
	if (isBrushOwned(type) || isBrushTryable(type)) {
		previewedLockedBrush.value = null;
		brushTrial.clearLockedOut();
		selectBrushType(type);
		return;
	}

	// Trial spent — look, don't touch.
	//
	// There used to be a `!isNative()` escape here that selected any locked brush
	// on the web build, on the reasoning that web cannot run a purchase. What it
	// actually did was delete the gate: select the brush, draw one stroke, eat the
	// "trial used up" toast, select it again, forever. The gate is the product
	// rule, so it holds everywhere — and `purchaseSku` already answers web
	// honestly ("Purchases are only available on the mobile app"), which is a
	// better answer than a paywall that silently does not apply.
	showUnlockFor(type);
}

/**
 * Put the menu into its locked state for one brush: the swatch renders so the
 * stroke is visible, the unlock CTA appears, and the brush is NOT selected.
 */
function showUnlockFor(type: BrushType) {
	const prevType = brushType.value;
	previewedLockedBrush.value = type;
	// The preview reads the store's brush type, so it is borrowed and handed
	// straight back — the active brush must never end up being the locked one.
	brushType.value = type;
	renderPreview();
	brushType.value = prevType;
}

// Drop the banner once the brush IT is about has been bought — not whenever the
// active brush happens to be an owned one. `showUnlockFor` borrows `brushType`
// and hands it straight back, and watchers flush after both assignments, so the
// old condition saw the restored (owned) brush and wiped the banner it had just
// been asked to show. The CTA never appeared.
watch(brushType, () => {
	const previewed = previewedLockedBrush.value;
	if (previewed !== null && isBrushOwned(previewed)) {
		previewedLockedBrush.value = null;
	}
});
watch(selectedTool, () =>
	selectedTool.value && PENMENUTOOLS.includes(selectedTool.value)
		? renderPreview()
		: null,
);
watch(penMenuOpen, async (open) => {
	if (!open) {
		previewedLockedBrush.value = null;
		return;
	}

	// A trial that ran out mid-drawing left the user holding a pencil they did
	// not pick. Opening the menu after that lands directly on the unlock CTA for
	// the brush they lost, which is the only screen where buying it is possible.
	const lockedOut = brushTrial.lockedOut;
	const lostBrush = lockedOut
		? BRUSHES.find((b) => brushItemId(b.type) === lockedOut)?.type
		: undefined;
	if (lostBrush !== undefined && !isBrushOwned(lostBrush)) {
		previewedLockedBrush.value = lostBrush;
	}
	brushTrial.clearLockedOut();

	// Re-render once the popover is actually laid out — only then does the fluid
	// stage report a real width, so the first paint isn't stuck at the fallback.
	await nextTick();
	if (previewedLockedBrush.value) showUnlockFor(previewedLockedBrush.value);
	else renderPreview();
});
</script>

<style scoped>
@reference "@/theme/main.css";

/* Shell, control rows, range, preview tag and scrollbar tokens are shared
   across the tool menus — see src/theme/draw-menu.css. */

/* Full-bleed stage: the canvas is sized to this element's measured width in
   renderPreview(), so no `w-fit` here — it must stretch to be measurable. */
.preview-stage {
  @apply relative rounded-xl overflow-hidden shadow-inner w-full;
}

/* auto-fit rather than a fixed column count: the tiles are a fixed 44px, so the
   row packs as many as the popover width allows and stays centred. */
.brush_grid {
  @apply grid gap-1 justify-items-center;
  /* 3rem (not the 2.75rem tile width) packs 5 per row rather than 6 at phone
     width — same two rows for 9 brushes, but 17px of air between tiles instead
     of 6px. */
  grid-template-columns: repeat(auto-fit, minmax(3rem, 1fr));
}

.smudge_launcher {
  @apply w-full flex items-center gap-2.5 p-2 rounded-2xl cursor-pointer border-0
  bg-secondary/10 ring-1 ring-secondary/20 active:scale-[0.99] transition-transform;
}

.smudge_launcher_icon {
  @apply w-9 h-9 shrink-0 rounded-xl bg-secondary/20 text-secondary
  flex items-center justify-center;
}

.smudge_launcher_icon ion-icon {
  @apply w-5 h-5;
}

.smudge_launcher_title {
  @apply text-xs font-black tracking-tight text-black/75;
}

.smudge_launcher_sub {
  @apply text-[10px] leading-snug text-black/45 truncate;
}

.smudge_launcher_chevron {
  @apply ml-auto text-black/25 text-base shrink-0;
}

.unlock-banner {
  @apply mt-1.5 w-full px-2.5 py-1.5 rounded-xl bg-secondary text-white border-0
  flex items-center justify-between cursor-pointer
  active:scale-[0.99] transition-transform disabled:opacity-70;
}

.width-value-button,
.width-value-input {
  width: 3.5rem;
  min-width: 3.5rem;
  height: 30px;
  border: 1px solid rgba(var(--ion-color-secondary-rgb), 0.3);
  border-radius: 0.625rem;
}

.width-value-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  cursor: pointer;
  box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
}

.width-value-button ion-icon {
  width: 11px;
  height: 11px;
  opacity: 0.7;
}

.width-value-input {
  padding: 0.125rem 0.3rem;
  outline: 2px solid rgba(var(--ion-color-secondary-rgb), 0.35);
  background: #fff;
  appearance: textfield;
}

.width-value-input::-webkit-inner-spin-button,
.width-value-input::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}
</style>
