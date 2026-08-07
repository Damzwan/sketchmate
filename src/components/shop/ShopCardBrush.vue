<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-28 bg-[#FAF6F0] relative flex items-center justify-center p-2 border-b border-black/5">
        <img v-if="previewUrl" :src="previewUrl" class="max-w-full pointer-events-none" alt="" />

        <div class="absolute top-2 right-2 w-7 h-7 rounded-lg bg-white border border-black/10 shadow-sm flex items-center justify-center text-black">
          <ion-icon :icon="svg(brushIcon)" class="text-sm" />
        </div>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { Canvas, Point } from "fabric";
import { computed, onMounted, ref } from "vue";
import type { ShopSku } from "@/config/catalog.config";
import { penBrushMapping, penIconMapping } from "@/draw/config/tools.config";
import { BrushType } from "@/draw/tools/tool.types";
import { svg } from "@/helper/general.helper";
import ShopCardShell from "./ShopCardShell.vue";

const props = defineProps<{
	sku: ShopSku;
	owned: boolean;
	highlight?: boolean;
}>();
defineEmits(["purchase"]);

const brushType = computed<BrushType>(() => {
	if (props.sku.refId === "neon") return BrushType.Neon;
	if (props.sku.refId === "calligraphy") return BrushType.CalliGraphy;
	return BrushType.Pencil;
});
const brushIcon = computed(() => penIconMapping[brushType.value]);

const previewUrl = ref("");

// Bake the sample stroke ONCE into a static data-URL image, off a DETACHED
// canvas. Fabric wraps and mutates whatever <canvas> DOM node it's handed; when
// the shop's category chips re-render / reorder the card list, Vue's patch
// desynced from fabric's injected wrapper and the live canvas blanked (and the
// old `if (canvasInstance) return` guard then blocked any redraw). A plain
// <img> built off-tree is immune to every list re-render.
onMounted(() => {
	const el = document.createElement("canvas");
	el.style.position = "fixed";
	el.style.left = "-9999px";
	el.style.top = "0";
	document.body.appendChild(el);

	let canvas: Canvas | null = null;
	try {
		canvas = new Canvas(el, { width: 150, height: 75, selection: false });
		canvas.backgroundColor = "rgba(0,0,0,0)";

		const brush = penBrushMapping[brushType.value](canvas) as any;
		canvas.freeDrawingBrush = brush;
		brush.color = "#1e1e1f";
		brush.width = brushType.value === BrushType.CalliGraphy ? 6 : 3;

		const amplitude = 10;
		const frequency = 0.07;
		const yOffset = 38;
		const pts: number[][] = [[10, yOffset]];
		for (let x = 18; x <= 140; x += 8) {
			pts.push([x, yOffset + amplitude * Math.sin(frequency * x)]);
		}
		const points = pts.map((p) => new Point(p[0], p[1]));

		brush.onMouseDown(points[0], { e: new MouseEvent("mousedown") });
		for (let i = 1; i < points.length; i++) {
			brush.onMouseMove(points[i], { e: new MouseEvent("mousemove") });
		}
		brush.onMouseUp({ e: new MouseEvent("mouseup") });
		canvas.renderAll();

		previewUrl.value = canvas.toDataURL({
			format: "png",
			multiplier: Math.min(window.devicePixelRatio || 1, 2),
		});
	} catch (e) {
		console.warn("[ShopCardBrush] preview failed", e);
	} finally {
		try {
			canvas?.dispose();
		} catch {
			/* ignore */
		}
		el.remove();
	}
});
</script>
