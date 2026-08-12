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
            <!-- Max raised 50 → 120. Filling areas with the pencil is a normal
                 workflow now that layers make block-fills worth doing, and 50
                 forced dozens of overlapping passes where one should do. The
                 eraser already went to 150, so this is not a new extreme for
                 the engine. Stroke geometry cost no longer scales badly with
                 width either — see strokeSimplification.ts. -->
            <ion-range aria-label="Stroke width" v-model="brushSize"
                       :min="0.1" :step="0.1" :max="120" color="secondary" />
            <span class="value_pill">{{ brushSize }}</span>
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

        <ColorPicker v-model:color="brushColor" :reset="penMenuOpen" />
      </div>
    </div>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonIcon, IonPopover, IonRange } from "@ionic/vue";
import { mdiArrowRight, mdiCreation, mdiLock } from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, nextTick, ref, watch } from "vue";
import ColorPicker from "@/components/draw/ColorPicker.vue";
import { useUnlockItem } from "@/composables/shop/useUnlockItem";
import { brushDisplayName, brushItemId } from "@/draw/config/paidBrushes";
import { PENMENUTOOLS, penIconMapping } from "@/draw/config/tools.config";
import { useBrushTrial } from "@/draw/tools/brushTrial.store";
import { usePen } from "@/draw/tools/pen.store";
import { BrushType, DrawTool } from "@/draw/tools/tool.types";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { svg } from "@/helper/general.helper";
import { useInventoryStore } from "@/store/inventory.store";
import { useMenuStore } from "@/store/menu.store";
import BrushTile from "./BrushTile.vue";
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
const inventoryStore = useInventoryStore();
const brushTrial = useBrushTrial();
const { purchasing, unlockItem } = useUnlockItem();

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

.unlock-banner {
  @apply mt-1.5 w-full px-2.5 py-1.5 rounded-xl bg-secondary text-white border-0
  flex items-center justify-between cursor-pointer
  active:scale-[0.99] transition-transform disabled:opacity-70;
}
</style>
