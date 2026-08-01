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
             visible — the user can see what they're buying. -->
        <button
          v-if="previewedLockedBrush"
          type="button"
          class="unlock-banner cabin-sketch-regular"
          :disabled="purchasing"
          @click="buyPreviewedBrush"
        >
          <div class="flex items-center gap-2 min-w-0">
            <ion-icon :icon="svg(mdiLock)" class="text-base shrink-0" />
            <span class="text-xs font-black tracking-tight truncate">
              {{ purchasing ? 'Unlocking…' : `Unlock ${brushDisplayName(previewedLockedBrush)}` }}
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
import { storeToRefs } from "pinia";
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { BrushType, DrawTool } from "@/draw/tools/tool.types";
import { mdiLock, mdiArrowRight } from "@mdi/js";
import { isNative, svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import ColorPicker from "@/components/draw/ColorPicker.vue";
import BrushTile from "./BrushTile.vue";
import { usePen } from "@/draw/tools/pen.store";
import { Canvas, Point } from "fabric";
import {
	hexWithOpacity,
	isColorTooLight,
	percentToAlphaHex,
} from "@/draw/utils/color.utils";
import { BLACK, WHITE } from "@/draw/config/canvas.config";
import {
	penBrushMapping,
	penIconMapping,
	PENMENUTOOLS,
} from "@/draw/config/tools.config";
import { useToolSelection } from "@/draw/tools/toolSelection.store";
import { useInventoryStore } from "@/store/inventory.store";
import { useUnlockItem } from "@/composables/shop/useUnlockItem";
import { buildItemId } from "@/config/catalog.config";

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
const { purchasing, unlockItem } = useUnlockItem();

const preview_canvas = ref<HTMLCanvasElement>();
const preview_stage = ref<HTMLElement>();
let canvas: Canvas | undefined;

const PREVIEW_HEIGHT = 56;
const PREVIEW_FALLBACK_WIDTH = 256;

// The stage is fluid now (it used to be a fixed 256px island inside a 296px
// popover). While the popover is closed `keepContentsMounted` leaves it in the
// DOM at zero width, so fall back until it has actually been laid out.
const previewWidth = (): number =>
	Math.round(preview_stage.value?.clientWidth || 0) || PREVIEW_FALLBACK_WIDTH;

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

const PAID_BRUSH_ITEM_IDS: Partial<Record<BrushType, string>> = {
	[BrushType.Neon]: buildItemId("brush", "neon"),
	[BrushType.CalliGraphy]: buildItemId("brush", "calligraphy"),
};

const brushItemId = (type: BrushType): string | null =>
	PAID_BRUSH_ITEM_IDS[type] ?? null;

const isBrushOwned = (type: BrushType): boolean => {
	const id = brushItemId(type);
	if (!id) return true;
	return inventoryStore.isOwned(id);
};

const brushDisplayName = (type: BrushType): string => {
	switch (type) {
		case BrushType.Neon:
			return "Neon Pen";
		case BrushType.CalliGraphy:
			return "Calligraphy";
		default:
			return "Brush";
	}
};

const previewedLockedBrush = ref<BrushType | null>(null);

// Buy the previewed locked brush in place (same flow as FontModal / EffectModal
// via useUnlockItem) instead of bouncing the user out to the shop. On success
// the brush is owned, so select it immediately.
const buyPreviewedBrush = async () => {
	const type = previewedLockedBrush.value;
	if (type == null) return;
	const id = brushItemId(type);
	if (!id) return;
	const ok = await unlockItem(id);
	if (ok) {
		previewedLockedBrush.value = null;
		selectBrushType(type);
	}
};

let stageObserver: ResizeObserver | null = null;

onMounted(() => {
	renderPreview();

	// The popover animates in, so the stage's final width isn't known at mount
	// OR at the first nextTick — measuring too early left the stroke ending
	// mid-card at the fallback width. Re-render whenever the box actually
	// settles, which also covers rotation and split-screen resizes.
	if (typeof ResizeObserver === "undefined" || !preview_stage.value) return;
	stageObserver = new ResizeObserver(() => {
		if (!preview_stage.value?.clientWidth) return;
		if (canvas && canvas.width === previewWidth()) return;
		renderPreview();
	});
	stageObserver.observe(preview_stage.value);
});

onBeforeUnmount(() => {
	stageObserver?.disconnect();
	canvas?.dispose();
	canvas = undefined;
});

const renderPreview = () => {
	const width = previewWidth();
	if (!canvas) {
		canvas = new Canvas(preview_canvas.value!, {
			width,
			height: PREVIEW_HEIGHT,
			selection: false,
		});
	} else {
		canvas.clear();
		if (canvas.width !== width) {
			canvas.setDimensions({ width, height: PREVIEW_HEIGHT });
		}
	}

	const brushColorValue = hexWithOpacity(
		brushColor.value,
		percentToAlphaHex(opacity.value),
	);
	canvas.backgroundColor = isColorTooLight(brushColorValue) ? BLACK : WHITE;
	canvas.freeDrawingBrush = penBrushMapping[brushType.value](canvas);
	const brush = canvas.freeDrawingBrush as any;
	brush.color = brushColorValue;
	if (brushType.value === BrushType.Spray) {
		brush.density = density.value;
		brush.dotWidth = dotWidth.value;
	}
	if (brushType.value === BrushType.Pixel) {
		brush.pixelSize = pixelSize.value;
	}
	brush.width = brushSize.value;

	const amplitude = 20;
	const frequency = 0.05;
	const yOffset = canvas.height! / 2;

	const wave = (x: number) => yOffset + amplitude * Math.sin(frequency * x);
	const points = [[0, yOffset]];
	for (let x = 1; x <= width; x += 10) points.push([x, wave(x)]);
	// The step can stop up to 9px short of the edge, which reads as the stroke
	// being cut off rather than running off the card. Land exactly on the edge.
	if (points[points.length - 1][0] < width) points.push([width, wave(width)]);
	const convertedPoints = points.map((p) => new Point(p[0], p[1]));

	brush.onMouseDown(convertedPoints[0], { e: new MouseEvent("mousedown") });
	for (let i = 1; i < points.length; i++) {
		brush.onMouseMove(convertedPoints[i], { e: new MouseEvent("mousemove") });
	}
	brush.onMouseUp({ e: new MouseEvent("mouseup") });
	canvas.getObjects().forEach((obj) => obj.set("selectable", false));
	canvas.renderAll();
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
	const owned = isBrushOwned(type);

	if (owned) {
		previewedLockedBrush.value = null;
		selectBrushType(type);
		return;
	}

	if (!isNative()) {
		selectBrushType(type);
		return;
	}

	const prevType = brushType.value;
	previewedLockedBrush.value = type;

	brushType.value = type;
	renderPreview();
	brushType.value = prevType;
}

watch(brushSize, renderPreview);
watch(opacity, renderPreview);
watch(brushColor, renderPreview);
watch(density, renderPreview);
watch(dotWidth, renderPreview);
watch(pixelSize, renderPreview);
watch(brushType, () => {
	if (isBrushOwned(brushType.value)) {
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
	// Re-render once the popover is actually laid out — only then does the fluid
	// stage report a real width, so the first paint isn't stuck at the fallback.
	await nextTick();
	renderPreview();
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
