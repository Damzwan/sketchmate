<template>
  <ion-popover
    :is-open="penMenuOpen"
    :event="menuEvent"
    @didDismiss="onDismiss"
    :keepContentsMounted="true"
    :showBackdrop="false"
    class="pen-popover"
    side="top" alignment="center"
  >
    <div class="pen-shell bg-tertiary border border-primary/20">

      <div class="pen-preview">
        <div class="preview-stage bg-[#FAF8F5] border border-primary/10">
          <canvas ref="preview_canvas"></canvas>
          <span class="preview-tag">Preview</span>

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
      </div>

      <div class="pen-body hide-scrollbar">
        <div class="control_card shadow-sm">
          <div>
            <div class="control_row">
              <label class="control_label">Stroke Width</label>
              <span class="value_pill">{{ brushSize }}</span>
            </div>
            <ion-range aria-label="Stroke width" v-model="brushSize"
                       :min="0.1" :step="0.1" :max="50" color="secondary" />
          </div>

          <div>
            <div class="control_row">
              <label class="control_label">Opacity</label>
              <span class="value_pill">{{ opacity }}%</span>
            </div>
            <ion-range aria-label="Opacity" v-model="opacity"
                       :min="0" :max="100" color="secondary" />
          </div>

          <template v-if="brushType === BrushType.Spray">
            <div>
              <div class="control_row">
                <label class="control_label">Density</label>
                <span class="value_pill">{{ density }}</span>
              </div>
              <ion-range aria-label="Density" v-model="density"
                         :min="1" :max="100" color="secondary" />
            </div>

            <div>
              <div class="control_row">
                <label class="control_label">Dot Width</label>
                <span class="value_pill">{{ dotWidth }}</span>
              </div>
              <ion-range aria-label="Dot width" v-model="dotWidth"
                         :min="0.5" :max="5" color="secondary" />
            </div>
          </template>

          <template v-if="brushType === BrushType.Pixel">
            <div>
              <div class="control_row">
                <label class="control_label">Pixel Size</label>
                <span class="value_pill">{{ pixelSize }}</span>
              </div>
              <ion-range aria-label="Pixel size" v-model="pixelSize"
                         :min="3" :max="30" :step="1" color="secondary" />
            </div>
          </template>

          <div class="card_divider"></div>

          <div>
            <label class="control_label">Brush</label>
            <div class="grid grid-cols-3 gap-x-1.5 gap-y-1 mt-1.5">
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
        </div>

        <ColorPicker v-model:color="brushColor" :reset="penMenuOpen" />
      </div>
    </div>
  </ion-popover>
</template>

<script lang="ts" setup>
import { IonIcon, IonPopover, IonRange } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { onMounted, ref, watch } from "vue";
import { BrushType, DrawTool } from "@/draw/types/draw.types";
import { mdiLock, mdiArrowRight } from "@mdi/js";
import { isNative, svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import ColorPicker from "@/components/draw/ColorPicker.vue";
import BrushTile from "./BrushTile.vue";
import { usePen } from "@/draw/store/tools/pen.store";
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
import { useToolSelection } from "@/draw/store/tools/toolSelection.store";
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
let canvas: Canvas | undefined;

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

onMounted(() => {
	renderPreview();
});

const renderPreview = () => {
	if (!canvas) {
		canvas = new Canvas(preview_canvas.value!, {
			width: 256,
			height: 64,
			selection: false,
		});
	} else {
		canvas.clear();
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

	const points = [[0, yOffset]];
	for (let x = 1; x <= canvas.width!; x += 10) {
		const y = yOffset + amplitude * Math.sin(frequency * x);
		points.push([x, y]);
	}
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
watch(penMenuOpen, (open) => {
	if (!open) previewedLockedBrush.value = null;
});
</script>

<style scoped>
@reference "@/theme/main.css";

.pen-popover {
  --border-radius: 26px;
  --backdrop-opacity: 0;
  --background: transparent;
  --box-shadow: 0 24px 64px -18px rgba(0, 0, 0, 0.25);
  --width: 296px;
}

.pen-popover::part(content) {
  border-radius: 26px;
  overflow: hidden;
}

.pen-shell {
  display: flex;
  flex-direction: column;
  max-height: 70vh;
}

.pen-preview {
  flex: 0 0 auto;
  @apply p-3 pb-0;
}

.preview-stage {
  @apply relative rounded-2xl overflow-hidden shadow-inner w-fit mx-auto;
}

.preview-tag {
  @apply absolute top-1.5 left-2 px-1.5 py-0.5 rounded-full bg-black/35 backdrop-blur-sm
  text-[8px] font-black uppercase tracking-widest text-white/80 pointer-events-none;
}

.unlock-banner {
  @apply absolute inset-x-0 bottom-0 w-full px-3 py-2 bg-secondary text-white border-0
  flex items-center justify-between cursor-pointer
  active:scale-[0.99] transition-transform disabled:opacity-70;
}

.pen-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  @apply p-3 space-y-2.5;
}

.control_card {
  @apply bg-background border border-primary/20 rounded-[1.75rem] p-3.5 space-y-2.5;
}

.card_divider {
  @apply h-px bg-primary/10;
}

.control_row {
  @apply flex items-center justify-between mb-0.5;
}

.control_label {
  @apply block text-[11px] font-black uppercase tracking-widest text-black/40;
}

.value_pill {
  @apply text-[11px] font-black text-secondary bg-secondary/10 px-2 py-0.5 rounded-full tabular-nums;
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

.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>