<template>
  <!-- Pointer-transparent by design: every event still has to reach the fabric
       canvas underneath, which is what does the sampling. The mode's controls
       live in the bottom dock (ToolDockColorPicker), like every other modal
       drawing state — this layer is only the loupe.

       The loupe sits above the finger so the pixels being sampled are not the
       ones under it, and flips below near the top edge. -->
  <div class="absolute inset-0 z-30 pointer-events-none">
    <div
      v-if="probe"
      class="absolute rounded-full overflow-hidden border-[3px] border-white shadow-xl"
      :style="loupeStyle"
    >
      <canvas ref="loupeCanvas" class="block w-full h-full" />
      <span class="absolute inset-x-0 bottom-0 py-0.5 text-center text-[9px] font-black tracking-widest text-white bg-black/65">
        {{ probe.hex.slice(0, 7) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import { getRenderDpr } from "@/draw/config/renderQuality.config";
import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawUIStore } from "@/draw/ui/drawUI.store";

/** Loupe diameter, and how many screen pixels one canvas pixel becomes in it. */
const LOUPE_PX = 116;
const MAGNIFICATION = 9;
/** How far above the pointer the loupe floats, centre to centre. */
const LOUPE_LIFT_PX = 96;

const { colorPickerProbe: probe } = storeToRefs(useDrawUIStore());
const loupeCanvas = ref<HTMLCanvasElement | null>(null);

const loupeStyle = computed(() => {
	const point = probe.value;
	if (!point) return {};
	const above = point.y - LOUPE_LIFT_PX - LOUPE_PX / 2 > 0;
	// Keep it fully on screen: the draw page clips its overflow, so a loupe
	// centred near an edge would come out as a half circle.
	const margin = LOUPE_PX / 2 + 8;
	const left = Math.min(
		Math.max(point.x, margin),
		Math.max(margin, window.innerWidth - margin),
	);
	return {
		width: `${LOUPE_PX}px`,
		height: `${LOUPE_PX}px`,
		left: `${left}px`,
		top: `${point.y + (above ? -LOUPE_LIFT_PX : LOUPE_LIFT_PX)}px`,
		transform: "translate(-50%, -50%)",
	};
});

/**
 * Blit the region around the probe out of the live canvas at nearest-neighbour,
 * so individual pixels are visible — the point of a loupe on a drawing app is
 * to show WHICH pixel is under the finger, not a smooth zoom.
 */
function renderLoupe() {
	const point = probe.value;
	const target = loupeCanvas.value;
	if (!point || !target) return;

	const source = useDrawStore().getCanvas()?.getElement?.();
	if (!source) return;

	const dpr = window.devicePixelRatio || 1;
	const size = Math.round(LOUPE_PX * dpr);
	if (target.width !== size) {
		target.width = size;
		target.height = size;
	}

	const context = target.getContext("2d");
	if (!context) return;

	// Source coordinates live in the BACKING STORE, which the engine caps at
	// MAX_RENDER_SCALE — the same reason the sampler uses getRenderDpr().
	const renderDpr = getRenderDpr();
	const sourceSpan = (LOUPE_PX / MAGNIFICATION) * renderDpr;
	const sx = point.x * renderDpr - sourceSpan / 2;
	const sy = point.y * renderDpr - sourceSpan / 2;

	context.imageSmoothingEnabled = false;
	context.fillStyle = "#ffffff";
	context.fillRect(0, 0, size, size);
	try {
		context.drawImage(source, sx, sy, sourceSpan, sourceSpan, 0, 0, size, size);
	} catch {
		return;
	}

	// The pixel that would actually be picked, boxed at the centre.
	const cell = (size / sourceSpan) * renderDpr;
	const box = Math.max(cell, 6);
	const offset = (size - box) / 2;
	context.lineWidth = Math.max(2, dpr);
	context.strokeStyle = "rgba(0,0,0,0.85)";
	context.strokeRect(offset, offset, box, box);
	context.lineWidth = Math.max(1, dpr / 2);
	context.strokeStyle = "rgba(255,255,255,0.95)";
	context.strokeRect(offset, offset, box, box);
}

watch(probe, renderLoupe, { flush: "post" });
</script>
