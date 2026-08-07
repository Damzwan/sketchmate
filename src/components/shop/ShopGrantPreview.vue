<template>
  <div class="w-full h-full relative overflow-hidden flex items-center justify-center">
    <!-- Theme: swatches on the theme's own card background -->
    <div
      v-if="category === 'theme'"
      class="w-full h-full flex items-center justify-center gap-1"
      :style="{ background: theme.cardBg }"
    >
      <span
        v-for="(c, i) in theme.swatches.slice(0, 3)"
        :key="i"
        class="w-3.5 h-3.5 rounded-full border border-white/70 shadow-sm"
        :style="{ backgroundColor: c }"
      ></span>
    </div>

    <!-- Effect: live effect over a mid-tone card so light/cracks read -->
    <div v-else-if="category === 'effect'" class="w-full h-full effect-stage">
      <ProfileEffect v-if="effectDef" :def="effectDef" :preview="true" />
    </div>

    <!-- World: static vignette. These 96px tiles appear a dozen at a time
         (bundle contents, collection sheet) — frozen frames + no CSS travel
         cost nothing, and at this size a still scene reads just as well. -->
    <div
      v-else-if="category === 'world'"
      class="w-full h-full bg-gradient-to-br from-[#26324a] to-[#161d2e]"
    >
      <ProfileWorld v-if="worldDef" :def="worldDef" :preview="true" :preview-scale="0.3" static-mode />
    </div>

    <!-- Decoration: framed avatar -->
    <div v-else-if="category === 'decoration'" class="w-full h-full bg-[#FAF6F0] flex items-center justify-center">
      <div class="relative w-10 h-10">
        <div class="w-full h-full rounded-full border border-black/15 bg-white overflow-hidden flex items-center justify-center">
          <img v-if="userImg" :src="userImg" class="w-full h-full object-cover" alt="" />
        </div>
        <AvatarDecoration v-if="decorationDef" :def="decorationDef" />
      </div>
    </div>

    <!-- Font: sample word -->
    <div v-else-if="category === 'font'" class="w-full h-full bg-[#FFF9F2] flex items-center justify-center px-2">
      <span class="text-2xl font-black text-black leading-none" :style="{ fontFamily }">{{ fontPreview }}</span>
    </div>

    <!-- Font effect: styled Aa -->
    <div v-else-if="category === 'font_effect'" class="w-full h-full bg-[#FFF9F2] flex items-center justify-center">
      <span class="text-3xl font-black leading-none" :class="fontEffectClass">Aa</span>
    </div>

    <!-- Brush: actual rendered stroke -->
    <div v-else-if="category === 'brush'" class="w-full h-full bg-[#FAF6F0] flex items-center justify-center p-1">
      <canvas ref="canvasEl" class="max-w-full max-h-full pointer-events-none"></canvas>
    </div>

    <div v-else class="w-full h-full bg-[#FAF6F0]"></div>
  </div>
</template>

<script setup lang="ts">
import { Canvas, Point } from "fabric";
import { computed, nextTick, onMounted, ref } from "vue";
import AvatarDecoration from "@/components/profile/customization/AvatarDecoration.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import { type ItemCategory } from "@/config/catalog.config";
import {
	FONTS,
	resolveDecoration,
	resolveEffect,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	resolveWorld,
} from "@/config/profile_options.config";
import { penBrushMapping } from "@/draw/config/tools.config";
import { BrushType } from "@/draw/tools/tool.types";

const props = defineProps<{ itemId: string; userImg?: string }>();

const parts = computed(() => props.itemId.split("."));
const category = computed(() => parts.value[0] as ItemCategory);
const refId = computed(() => parts.value.slice(1).join("."));

const theme = computed(() => resolveTheme(refId.value));
const effectDef = computed(() => resolveEffect(refId.value));
const worldDef = computed(() => resolveWorld(refId.value));
const decorationDef = computed(() => resolveDecoration(refId.value));
const fontFamily = computed(() => resolveFontFamily(refId.value));
const fontPreview = computed(
	() => FONTS.find((f) => f.value === refId.value)?.preview || "Aa",
);
const fontEffectClass = computed(() => resolveFontEffectClass(refId.value));

// Brush: draw a small sine stroke with the real brush, mirroring ShopCardBrush.
const canvasEl = ref<HTMLCanvasElement | null>(null);
const brushType = computed<BrushType>(() =>
	refId.value === "neon"
		? BrushType.Neon
		: refId.value === "calligraphy"
			? BrushType.CalliGraphy
			: BrushType.Pencil,
);

onMounted(async () => {
	if (category.value !== "brush") return;
	await nextTick();
	if (!canvasEl.value) return;
	const canvas = new Canvas(canvasEl.value, {
		width: 120,
		height: 60,
		selection: false,
	});
	canvas.backgroundColor = "rgba(0,0,0,0)";
	try {
		canvas.freeDrawingBrush = penBrushMapping[brushType.value](canvas);
		const brush = canvas.freeDrawingBrush as any;
		brush.color = "#1e1e1f";
		brush.width = brushType.value === BrushType.CalliGraphy ? 5 : 3;
		const pts: [number, number][] = [[8, 30]];
		for (let x = 14; x <= 112; x += 7)
			pts.push([x, 30 + 9 * Math.sin(0.08 * x)]);
		const points = pts.map((p) => new Point(p[0], p[1]));
		brush.onMouseDown(points[0], { e: new MouseEvent("mousedown") });
		for (let i = 1; i < points.length; i++)
			brush.onMouseMove(points[i], { e: new MouseEvent("mousemove") });
		brush.onMouseUp({ e: new MouseEvent("mouseup") });
		canvas.getObjects().forEach((o) => o.set("selectable", false));
		canvas.renderAll();
	} catch (e) {
		console.warn("[ShopGrantPreview] brush render failed", e);
	}
});
</script>

<style scoped>
/* Mid slate so subtle white effects (e.g. shattered glass) stay visible. */
.effect-stage {
  background: linear-gradient(135deg, #4a5568, #2d3748);
}
</style>
