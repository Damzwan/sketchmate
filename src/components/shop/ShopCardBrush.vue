<template>
  <ShopCardShell :sku="sku" :owned="owned" :highlight="highlight" @purchase="$emit('purchase')">
    <template #preview>
      <div class="h-28 bg-[#FAF6F0] relative flex items-center justify-center p-2 border-b border-black/5">
        <canvas :ref="initCanvas" class="max-w-full pointer-events-none"></canvas>

        <div class="absolute top-2 right-2 w-7 h-7 rounded-lg bg-white border border-black/10 shadow-sm flex items-center justify-center text-black">
          <ion-icon :icon="svg(brushIcon)" class="text-sm" />
        </div>
      </div>
    </template>
  </ShopCardShell>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IonIcon } from "@ionic/vue";
import { Canvas, Point } from "fabric";
import type { ShopSku } from "@/config/catalog.config";
import { BrushType } from "@/draw/types/draw.types";
import { penBrushMapping, penIconMapping } from "@/draw/config/tools.config";
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

// Keep track of the instance to avoid duplicate setups if the slot re-renders
let canvasInstance: Canvas | null = null;

const initCanvas = (el: HTMLCanvasElement | null) => {
	if (!el || canvasInstance) return;

	const canvas = new Canvas(el, {
		width: 150,
		height: 75,
		selection: false,
	});
	canvasInstance = canvas;
	canvas.backgroundColor = "rgba(0,0,0,0)";

	try {
		canvas.freeDrawingBrush = penBrushMapping[brushType.value](canvas);
		const brush = canvas.freeDrawingBrush as any;
		brush.color = "#1e1e1f";
		brush.width = brushType.value === BrushType.CalliGraphy ? 6 : 3;

		const amplitude = 10;
		const frequency = 0.07;
		const yOffset = 38;
		const pts = [[10, yOffset]];
		for (let x = 18; x <= 140; x += 8) {
			pts.push([x, yOffset + amplitude * Math.sin(frequency * x)]);
		}
		const points = pts.map((p) => new Point(p[0], p[1]));

		brush.onMouseDown(points[0], { e: new MouseEvent("mousedown") });
		for (let i = 1; i < points.length; i++) {
			brush.onMouseMove(points[i], { e: new MouseEvent("mousemove") });
		}
		brush.onMouseUp({ e: new MouseEvent("mouseup") });
		canvas.getObjects().forEach((o) => o.set("selectable", false));
		canvas.renderAll();
	} catch (e) {
		console.warn("[ShopCardBrush] preview failed", e);
	}
};
</script>