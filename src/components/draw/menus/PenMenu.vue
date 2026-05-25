<template>
  <ion-popover
    :is-open="penMenuOpen"
    :event="menuEvent"
    @didDismiss="onDismiss"
    :keepContentsMounted="true"
    :showBackdrop="false"
    side="top" alignment="center"
  >
    <ion-content class="divide-y divide-primary bg-background menu-scroll-container">
      <!-- Stroke Preview -->
      <div class="relative">
        <canvas ref="preview_canvas"></canvas>

        <!-- Locked brush banner — overlays the preview when a locked brush is
             previewed but not owned. Tap to go to shop. -->
        <div
          v-if="previewedLockedBrush"
          class="absolute inset-x-0 bottom-0 px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-500 text-white flex items-center justify-between cursor-pointer active:scale-[0.99] transition-transform"
          @click="goToShopForBrush(previewedLockedBrush)"
        >
          <div class="flex items-center gap-2 min-w-0">
            <ion-icon :icon="svg(mdiLock)" class="text-base shrink-0" />
            <span class="text-xs font-black uppercase tracking-wide truncate">
              Unlock {{ brushDisplayName(previewedLockedBrush) }}
            </span>
          </div>
          <span class="text-[10px] font-bold opacity-90 whitespace-nowrap ml-2">
            Get it →
          </span>
        </div>
      </div>

      <!-- Brush Size Slider -->
      <div class="px-2 pt-1">
        <label for="slider">Stroke Width: {{ brushSize }}</label>
        <ion-range aria-label="Stroke width" id="slider" v-model="brushSize" :min="0.1" :step="0.1" :max="50"
                   color="secondary" />
      </div>

      <div class="px-2 pt-1">
        <label for="slider">Opacity: {{ opacity }}</label>
        <ion-range aria-label="Opacity" id="slider" v-model="opacity" :min="0" :max="100" color="secondary" />
      </div>

      <template v-if="brushType === BrushType.Spray">
        <div class="px-2 pt-1">
          <label for="slider">Density: {{ density }}</label>
          <ion-range aria-label="Density" id="slider" v-model="density" :min="1" :max="100" color="secondary" />
        </div>

        <div class="px-2 pt-1">
          <label for="slider">DotWidth: {{ dotWidth }}</label>
          <ion-range aria-label="Dot width" id="slider" v-model="dotWidth" :min="0.5" :max="5" color="secondary" />
        </div>
      </template>

      <!-- Brush Type -->
      <div class="p-1">
        <label for="brush-type">Brush Type</label>
        <div class="flex justify-between mt-1 px-1" id="brush-type">
          <BrushTile :type="BrushType.Pencil" bg="bg-green-400" />
          <BrushTile :type="BrushType.WaterColor" bg="bg-red-400" />
          <BrushTile :type="BrushType.Spray" bg="bg-blue-400" />
          <BrushTile :type="BrushType.Circle" bg="bg-yellow-400" />
        </div>

        <div class="flex justify-between mt-1 px-1">
          <BrushTile :type="BrushType.Pixel" bg="bg-emerald-500" />
          <BrushTile :type="BrushType.Crayon" bg="bg-orange-400" />
          <BrushTile :type="BrushType.Charcoal" bg="bg-neutral-600" />
          <BrushTile :type="BrushType.Neon" bg="bg-indigo-500" />
          <BrushTile :type="BrushType.CalliGraphy" bg="bg-sky-400" />
        </div>
      </div>

      <!-- Color Picker -->
      <ColorPicker v-model:color="brushColor" :reset="penMenuOpen" />
    </ion-content>
  </ion-popover>
</template>

<script lang="ts" setup>
import {
	IonContent,
	IonIcon,
	IonPopover,
	IonRange,
	IonButton,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import { computed, h, onMounted, ref, watch } from "vue";
import { BrushType, DrawTool } from "@/draw/types/draw.types";
import { mdiLock } from "@mdi/js";
import { isNative, svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import ColorPicker from "@/components/draw/ColorPicker.vue";
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
import { useSubscriptionStore } from "@/store/subscription.store";
import { useInventoryStore } from "@/store/inventory.store";
import { buildItemId } from "@/config/catalog.config";

const { selectTool } = useToolSelection();
const { selectedTool } = storeToRefs(useToolSelection());
const { brushSize, brushColor, brushType, opacity, density, dotWidth } =
	storeToRefs(usePen());
const { penMenuOpen, menuEvent } = storeToRefs(useMenuStore());
const menuStore = useMenuStore();
const subStore = useSubscriptionStore();
const inventoryStore = useInventoryStore();

const preview_canvas = ref<HTMLCanvasElement>();
let canvas: Canvas | undefined;

// ─── Brush ownership ─────────────────────────────────────────────────────────
// Map BrushType enum values to our catalog item ID convention. Only paid
// brushes need to appear here — anything not listed is treated as free.
const PAID_BRUSH_ITEM_IDS: Partial<Record<BrushType, string>> = {
	[BrushType.Neon]: buildItemId("brush", "neon"),
	[BrushType.CalliGraphy]: buildItemId("brush", "calligraphy"),
};

const brushItemId = (type: BrushType): string | null =>
	PAID_BRUSH_ITEM_IDS[type] ?? null;

const isBrushOwned = (type: BrushType): boolean => {
	const id = brushItemId(type);
	if (!id) return true; // free brush
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

// Track which locked brush is currently being previewed (if any). Cleared
// when the user picks an owned brush or closes the menu.
const previewedLockedBrush = ref<BrushType | null>(null);

const goToShopForBrush = (type: BrushType) => {
	const id = brushItemId(type);
	if (!id) return;
	penMenuOpen.value = false;
	setTimeout(() => menuStore.openShop(id), 200);
};

// ─── Preview canvas rendering ────────────────────────────────────────────────
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

// ─── Brush selection with lock logic ─────────────────────────────────────────
function selectBrushType(newBrushType: BrushType) {
	if (selectedTool.value != DrawTool.Pen) selectTool(DrawTool.Pen);
	brushType.value = newBrushType;
	renderPreview();
}

function isBrushTypeSelected(type: BrushType) {
	return brushType.value == type && selectedTool.value == DrawTool.Pen;
}

/**
 * Unified brush picker. Behavior:
 *   - Free brush → just select.
 *   - Owned paid brush → select.
 *   - Locked paid brush + native → preview the stroke, show unlock banner.
 *   - Locked paid brush + web → select anyway (web is preview-only anyway).
 */
async function onBrushTap(type: BrushType) {
	const owned = isBrushOwned(type);

	if (owned) {
		previewedLockedBrush.value = null;
		selectBrushType(type);
		return;
	}

	// Locked path — preview without applying as the active brush
	if (!isNative()) {
		selectBrushType(type);
		return;
	}

	// Render the stroke preview using this brush so user sees what it looks
	// like, but DON'T set it as the active drawing brush (drawing should still
	// use their last owned brush). We achieve this by saving current state,
	// rendering with the locked brush, then restoring.
	const prevType = brushType.value;
	previewedLockedBrush.value = type;

	// Visual preview: temporarily render with locked brush
	brushType.value = type;
	renderPreview();
	// Restore the active brush so canvas drawing isn't affected
	brushType.value = prevType;
}

// ─── BrushTile inline subcomponent ───────────────────────────────────────────
// Renders one brush option with selection ring + lock badge when locked.
const BrushTile = (props: { type: BrushType; bg: string }) => {
	const owned = isBrushOwned(props.type);
	const selected = isBrushTypeSelected(props.type);
	const previewed = previewedLockedBrush.value === props.type;

	return h(
		"div",
		{
			class: [
				"brush_option",
				props.bg,
				selected && "brush_selected",
				previewed && "brush_previewed",
				!owned && "brush_locked",
			],
			onClick: () => onBrushTap(props.type),
		},
		[
			h("ion-icon", { icon: svg(penIconMapping[props.type]) }),
			!owned &&
				h(
					"div",
					{
						class:
							"absolute -top-1 -right-1 w-4 h-4 bg-black rounded-full flex items-center justify-center shadow-md",
					},
					[
						h("ion-icon", {
							icon: svg(mdiLock),
							class: "text-white text-[10px]",
						}),
					],
				),
		],
	);
};

watch(brushSize, renderPreview);
watch(opacity, renderPreview);
watch(brushColor, renderPreview);
watch(density, renderPreview);
watch(dotWidth, renderPreview);
watch(brushType, () => {
	// When user picks an OWNED brush, clear the locked-preview banner
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

.brush_option {
  @apply cursor-pointer rounded-full w-[34px] h-[34px] flex justify-center items-center relative;
}

.brush_option ion-icon {
  @apply w-[20px] h-[20px];
}

.brush_selected {
  @apply border-[3px] border-secondary;
}

/* Subtle ring when previewing a locked brush so users see what they tapped */
.brush_previewed {
  @apply ring-2 ring-purple-500 ring-offset-1;
}

.brush_locked {
  @apply opacity-80;
}

ion-item {
  --inner-padding-end: 0;
  --padding-start: 0;
}

label {
  @apply block text-sm font-medium text-gray-700;
}

.menu-scroll-container {
  --max-height: 70vh;
  height: var(--max-height);
}

ion-content::part(scroll) {
  max-height: var(--max-height);
}
</style>