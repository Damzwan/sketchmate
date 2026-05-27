<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    @will-present="onPresent"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-sketch-modal"
  >
    <div
      class="h-full flex flex-col p-4 bot-pad-safe overflow-hidden"
      :style="{ background: 'var(--ion-color-tertiary)' }"
      @touchmove.stop
    >
      <div class="shrink-0 mb-2 text-center relative">
        <div class="absolute right-[-8px] top-[-8px]">
          <ion-button fill="clear" color="dark" class="ion-no-margin" @click="handleDismiss">
            <ion-icon slot="icon-only" :icon="svg(mdiClose)" class="text-xl" />
          </ion-button>
        </div>
        <h1 class="text-2xl text-secondary font-black tracking-tighter italic leading-none">
          Card Doodle
        </h1>
        <p class="text-[10px] font-bold opacity-60 uppercase tracking-widest mt-1">
          Draw around your avatar and name
        </p>
      </div>

      <div class="shrink-0 flex flex-col gap-2 mb-3 px-1">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[9px] font-black uppercase tracking-widest opacity-50 shrink-0">
            {{ strokes.length }} {{ strokes.length === 1 ? 'stroke' : 'strokes' }}
          </span>

          <div class="flex items-center gap-1 p-1 rounded-full bg-white/50 border border-white/60 shadow-inner">
            <button
              v-for="opt in widthOptions"
              :key="opt.value"
              class="flex items-center justify-center transition-all rounded-full active:scale-95"
              :class="brushWidth === opt.value ? 'bg-secondary shadow-sm' : 'bg-transparent'"
              style="width: 36px; height: 24px;"
              :title="opt.label"
              @click="brushWidth = opt.value"
            >
              <span
                class="block rounded-full"
                :style="{
                  width: `${opt.previewSize}px`,
                  height: `${opt.previewSize}px`,
                  backgroundColor: brushWidth === opt.value ? '#ffffff' : color,
                  opacity: brushWidth === opt.value ? 1 : 0.7,
                }"
              ></span>
            </button>
          </div>

          <div class="w-10 shrink-0"></div>
        </div>

        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center bg-white/50 border border-white/60 rounded-full p-[2px] shadow-inner shrink-0">
            <button
              class="h-7 px-3 flex items-center justify-center gap-1.5 rounded-full transition-all active:scale-95"
              :class="!isPanMode ? 'bg-secondary text-white shadow-sm' : 'text-black/50'"
              @click="isPanMode = false"
            >
              <ion-icon :icon="svg(mdiBrush)" class="text-sm" />
              <span class="text-[9px] font-black tracking-widest">DRAW</span>
            </button>
            <button
              class="h-7 px-3 flex items-center justify-center gap-1.5 rounded-full transition-all active:scale-95"
              :class="isPanMode ? 'bg-secondary text-white shadow-sm' : 'text-black/50'"
              @click="isPanMode = true"
            >
              <ion-icon :icon="svg(mdiCursorMove)" class="text-sm" />
              <span class="text-[9px] font-black tracking-widest">PAN</span>
            </button>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <button
              class="h-8 px-3 flex items-center justify-center gap-1 rounded-full transition-all active:scale-95"
              :class="zoomLevel > 1 ? 'bg-secondary text-white' : 'bg-white/50 border border-white/60'"
              @click="cycleZoom"
            >
              <ion-icon :icon="svg(mdiMagnifyPlusOutline)" class="text-sm" />
              <span class="text-[9px] font-black tracking-widest">{{ zoomLabel }}</span>
            </button>

            <ion-button
              fill="clear"
              color="dark"
              size="small"
              class="ion-no-margin h-8"
              :disabled="strokes.length === 0"
              @click="undo"
            >
              <ion-icon slot="icon-only" :icon="svg(mdiUndoVariant)" class="text-lg" />
            </ion-button>
          </div>
        </div>
      </div>

      <div
        ref="viewportRef"
        class="flex-1 w-full overflow-auto min-h-0 hide-scrollbar relative"
      >
        <div
          class="w-full min-h-full flex items-start pt-2 pb-12"
          :style="{ paddingLeft: `max(0px, calc(50% - ${CANONICAL_CARD_WIDTH * zoomLevel / 2}px))` }"
        >
          <div
            class="relative shrink-0 transition-all duration-200"
            :style="{
              width: `${CANONICAL_CARD_WIDTH * zoomLevel}px`,
              height: 'auto'
            }"
          >
            <div
              ref="cardWrapperRef"
              class="transition-transform duration-200 origin-top-left"
              :style="{
                width: `${CANONICAL_CARD_WIDTH}px`,
                transform: `scale(${zoomLevel})`
              }"
            >
              <div
                class="pointer-events-none select-none"
                :style="{
                  opacity: 0.35,
                  maskImage: maskGradient,
                  WebkitMaskImage: maskGradient,
                }"
              >
                <ProfileCard
                  :user="user || {}"
                  :customization="cardCustomization"
                  :is-own-profile="false"
                  :is-preview="true"
                />
              </div>

              <div
                ref="padRef"
                class="absolute"
                :class="isPanMode ? 'cursor-grab touch-auto' : 'cursor-crosshair touch-none'"
                :style="{
                  top: `${zoneRenderTop}px`,
                  left: `${zoneRenderLeft}px`,
                  width: `${zoneRenderWidth}px`,
                  height: `${zoneRenderHeight}px`,
                }"
                @pointerdown="startStroke"
                @pointermove="draw"
                @pointerup="endStroke"
                @pointercancel="endStroke"
                @pointerout="endStroke"
              >
                <div
                  class="absolute inset-0 rounded-[2rem] border-2 border-dashed pointer-events-none"
                  :style="{ borderColor: theme.nameColor, opacity: 0.2 }"
                ></div>

                <div class="absolute inset-0 pointer-events-none flex justify-center">
                  <svg
                    v-if="zoneRenderWidth > 0"
                    class="w-full h-full max-w-[360px]"
                    :viewBox="`0 0 ${CANONICAL_ZONE_WIDTH} ${CANONICAL_ZONE_HEIGHT}`"
                    preserveAspectRatio="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      v-for="(stroke, i) in strokes"
                      :key="i"
                      :d="safeBuildPath(stroke)"
                      fill="none"
                      :stroke="color"
                      :stroke-width="stroke.width"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      :opacity="previewOpacity"
                    />
                    <path
                      v-if="currentStroke.length >= 1"
                      :d="buildPath(currentStroke)"
                      fill="none"
                      :stroke="color"
                      :stroke-width="brushWidth"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      :opacity="previewOpacity"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2 mt-2 shrink-0 pb-1 relative z-20">
        <p v-if="!isPro" class="text-center text-[10px] font-bold text-secondary/70 uppercase tracking-wider">
          🔒 Premium feature: Pro subscription required
        </p>

        <div class="grid grid-cols-2 gap-3">
          <ion-button
            fill="clear"
            color="dark"
            @click="clear"
          >
            Clear
          </ion-button>
          <ion-button
            color="secondary"
            shape="round"
            :disabled="!isPro"
            @click="save"
          >
            <div class="flex items-center justify-center gap-1">
              <ion-icon v-if="!isPro" :icon="svg(mdiLock)" class="text-sm opacity-80" />
              <span>Apply ✓</span>
            </div>
          </ion-button>
        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { IonModal, IonButton, IonIcon } from "@ionic/vue";
import {
	mdiClose,
	mdiMagnifyPlusOutline,
	mdiUndoVariant,
	mdiCursorMove,
	mdiBrush,
	mdiLock,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import ProfileCard from "@/components/profile/ProfileCard.vue";
import {
	hydrateCustomization,
	resolveTheme,
	type Customization,
} from "@/config/profile_options.config";
import { useSubscriptionStore } from "@/store/subscription.store";

type Point = [number, number];
type Stroke = { points: Point[]; width: number };

const CANONICAL_CARD_WIDTH = 360;
const CANONICAL_ZONE_WIDTH = ref(0);
const CANONICAL_ZONE_HEIGHT = ref(0);

const props = defineProps<{
	isOpen: boolean;
	color: string;
	customization?: Partial<Customization>;
	user?: any;
	initialPath?: string;
	initialViewBox?: string;
}>();

const emit = defineEmits<{
	(e: "close"): void;
	(e: "save", payload: { path: string; viewBox: string }): void;
}>();

const subscriptionStore = useSubscriptionStore();
const isPro = computed(() => subscriptionStore.isPro);

const previewOpacity = 0.25;

const widthOptions = [
	{ value: 4, label: "Thin", previewSize: 6 },
	{ value: 7, label: "Medium", previewSize: 10 },
	{ value: 11, label: "Bold", previewSize: 14 },
] as const;

const brushWidth = ref<number>(widthOptions[1].value);

const zoomSteps = [1, 1.6, 2.4] as const;
const zoomIndex = ref(0);
const zoomLevel = computed(() => zoomSteps[zoomIndex.value]);
const zoomLabel = computed(() =>
	zoomLevel.value === 1 ? "1×" : `${zoomLevel.value}×`,
);

const isPanMode = ref(false);
const viewportRef = ref<HTMLElement | null>(null);
const cardWrapperRef = ref<HTMLElement | null>(null);
const padRef = ref<HTMLElement | null>(null);

const zoneRenderTop = ref(0);
const zoneRenderLeft = ref(0);
const zoneRenderWidth = ref(0);
const zoneRenderHeight = ref(0);

const strokes = ref<Stroke[]>([]);
const currentStroke = ref<Point[]>([]);
const isDrawing = ref(false);

const cardCustomization = computed(() => ({
	...(props.customization || {}),
	backgroundSketchPath: "",
	backgroundSketchViewBox: "",
}));

const effectiveCustomization = computed(() =>
	hydrateCustomization(props.customization || {}),
);
const theme = computed(() =>
	resolveTheme(effectiveCustomization.value.themeId),
);

const maskGradient = computed(() => {
	const wrapperEl = cardWrapperRef.value;
	if (!wrapperEl) return "none";
	const wrapperRect = wrapperEl.getBoundingClientRect();
	if (wrapperRect.height === 0) return "none";
	const zoneBottomPx = zoneRenderTop.value + zoneRenderHeight.value;
	const wrapperHeightCss = wrapperRect.height / zoomLevel.value;
	const fadeStart = (zoneBottomPx / wrapperHeightCss) * 100;
	const fadeEnd = Math.min(100, fadeStart + 8);
	return `linear-gradient(to bottom, black 0%, black ${fadeStart}%, transparent ${fadeEnd}%)`;
});

let resizeObserver: ResizeObserver | null = null;

const measureZone = () => {
	if (!cardWrapperRef.value) return;

	const zoneEl =
		cardWrapperRef.value.querySelector<HTMLElement>(".js-doodle-zone");
	if (!zoneEl) return;

	const wrapperRect = cardWrapperRef.value.getBoundingClientRect();
	const zoneRect = zoneEl.getBoundingClientRect();
	if (zoneRect.width === 0 || zoneRect.height === 0) return;

	const z = zoomLevel.value;
	zoneRenderTop.value = Math.round((zoneRect.top - wrapperRect.top) / z);
	zoneRenderLeft.value = Math.round((zoneRect.left - wrapperRect.left) / z);
	zoneRenderWidth.value = Math.round(zoneRect.width / z);
	zoneRenderHeight.value = Math.round(zoneRect.height / z);

	if (CANONICAL_ZONE_WIDTH.value === 0) {
		CANONICAL_ZONE_WIDTH.value = zoneRenderWidth.value;
		CANONICAL_ZONE_HEIGHT.value = zoneRenderHeight.value;
	}
};

const onPresent = async () => {
	zoomIndex.value = 0;
	isPanMode.value = false;
	CANONICAL_ZONE_WIDTH.value = 0;
	CANONICAL_ZONE_HEIGHT.value = 0;
	await nextTick();

	measureZone();
	setTimeout(() => measureZone(), 150);

	if (cardWrapperRef.value && typeof ResizeObserver !== "undefined") {
		resizeObserver?.disconnect();
		resizeObserver = new ResizeObserver(() => {
			measureZone();
		});
		resizeObserver.observe(cardWrapperRef.value);
		const zoneEl =
			cardWrapperRef.value.querySelector<HTMLElement>(".js-doodle-zone");
		if (zoneEl) resizeObserver.observe(zoneEl);
	}

	strokes.value = props.initialPath
		? parsePathToStrokes(props.initialPath)
		: [];
	currentStroke.value = [];
};

onBeforeUnmount(() => {
	resizeObserver?.disconnect();
});

watch(
	() => props.initialPath,
	(val) => {
		if (props.isOpen) {
			strokes.value = val ? parsePathToStrokes(val) : [];
		}
	},
);

const cycleZoom = async () => {
	zoomIndex.value = (zoomIndex.value + 1) % zoomSteps.length;
	await nextTick();
	if (zoomLevel.value > 1 && viewportRef.value && padRef.value) {
		const viewportRect = viewportRef.value.getBoundingClientRect();
		const padRect = padRef.value.getBoundingClientRect();
		viewportRef.value.scrollTo({
			top: viewportRef.value.scrollTop + (padRect.top - viewportRect.top) - 20,
			left:
				viewportRef.value.scrollLeft +
				(padRect.left - viewportRect.left) -
				(viewportRect.width - padRect.width) / 2,
			behavior: "smooth",
		});
	}
};

const getPoint = (e: PointerEvent): Point => {
	const rect = padRef.value!.getBoundingClientRect();
	const scaleX = CANONICAL_ZONE_WIDTH.value / rect.width;
	const scaleY = CANONICAL_ZONE_HEIGHT.value / rect.height;
	return [
		Number(((e.clientX - rect.left) * scaleX).toFixed(1)),
		Number(((e.clientY - rect.top) * scaleY).toFixed(1)),
	];
};

const startStroke = (e: PointerEvent) => {
	if (isPanMode.value) return;
	e.preventDefault();
	if (!padRef.value || CANONICAL_ZONE_WIDTH.value === 0) return;
	padRef.value.setPointerCapture(e.pointerId);
	isDrawing.value = true;
	currentStroke.value = [getPoint(e)];
};

const draw = (e: PointerEvent) => {
	if (isPanMode.value) return;
	e.preventDefault();
	if (!isDrawing.value) return;
	const newPoint = getPoint(e);
	const lastPoint = currentStroke.value[currentStroke.value.length - 1];
	if (lastPoint) {
		const dx = newPoint[0] - lastPoint[0];
		const dy = newPoint[1] - lastPoint[1];
		if (dx * dx + dy * dy < 4) return;
	}
	currentStroke.value.push(newPoint);
};

const endStroke = (e: PointerEvent) => {
	if (isPanMode.value) return;
	e.preventDefault();
	if (!isDrawing.value) return;
	isDrawing.value = false;
	padRef.value?.releasePointerCapture(e.pointerId);

	if (currentStroke.value.length === 1) {
		strokes.value.push({
			points: [currentStroke.value[0]],
			width: brushWidth.value,
		});
	} else if (currentStroke.value.length > 1) {
		strokes.value.push({
			points: simplifyPath(currentStroke.value, 1.5),
			width: brushWidth.value,
		});
	}
	currentStroke.value = [];
};

const undo = () => {
	strokes.value.pop();
};
const clear = () => {
	strokes.value = [];
	currentStroke.value = [];
};

const save = () => {
	if (!isPro.value) return;
	if (strokes.value.length === 0) {
		emit("save", { path: "", viewBox: "" });
		return;
	}
	const combinedPath = strokes.value
		.map((s) => `[${s.width}]${buildPath(s.points)}`)
		.join(" ");
	const viewBox = `0 0 ${CANONICAL_ZONE_WIDTH.value} ${CANONICAL_ZONE_HEIGHT.value}`;
	emit("save", { path: combinedPath, viewBox });
	clear();
};

const handleDismiss = () => {
	clear();
	zoomIndex.value = 0;
	isPanMode.value = false;
	emit("close");
};

function getSqSegDist(p: Point, p1: Point, p2: Point): number {
	let x = p1[0],
		y = p1[1],
		dx = p2[0] - x,
		dy = p2[1] - y;
	if (dx !== 0 || dy !== 0) {
		const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
		if (t > 1) {
			x = p2[0];
			y = p2[1];
		} else if (t > 0) {
			x += dx * t;
			y += dy * t;
		}
	}
	dx = p[0] - x;
	dy = p[1] - y;
	return dx * dx + dy * dy;
}

function simplifyDPStep(
	points: Point[],
	first: number,
	last: number,
	sqTolerance: number,
	simplified: Point[],
) {
	let maxSqDist = sqTolerance,
		index = -1;
	for (let i = first + 1; i < last; i++) {
		const sqDist = getSqSegDist(points[i], points[first], points[last]);
		if (sqDist > maxSqDist) {
			index = i;
			maxSqDist = sqDist;
		}
	}
	if (index > -1) {
		if (index - first > 1)
			simplifyDPStep(points, first, index, sqTolerance, simplified);
		simplified.push(points[index]);
		if (last - index > 1)
			simplifyDPStep(points, index, last, sqTolerance, simplified);
	}
}

function simplifyPath(points: Point[], tolerance = 1.5): Point[] {
	if (points.length <= 2) return points;
	const sqTolerance = tolerance * tolerance;
	const simplified: Point[] = [points[0]];
	simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
	simplified.push(points[points.length - 1]);
	return simplified;
}

// Cleans up any potential bracket leftovers if a bad structure gets passed back downstream
const safeBuildPath = (stroke: Stroke): string => {
	if (!stroke || !stroke.points) return "";
	return buildPath(stroke.points);
};

const buildPath = (points: Point[]): string => {
	if (points.length === 0) return "";
	if (points.length === 1) {
		const [x, y] = points[0];
		return `M${x},${y} L${x},${y}`;
	}
	const d: string[] = [];
	d.push(`M${points[0][0]},${points[0][1]}`);
	for (let i = 1; i < points.length - 1; i++) {
		const midX = Number(((points[i][0] + points[i + 1][0]) / 2).toFixed(1));
		const midY = Number(((points[i][1] + points[i + 1][1]) / 2).toFixed(1));
		d.push(`Q${points[i][0]},${points[i][1]} ${midX},${midY}`);
	}
	const last = points[points.length - 1];
	d.push(`L${last[0]},${last[1]}`);
	return d.join("");
};

function parsePathToStrokes(pathStr: string): Stroke[] {
	if (!pathStr) return [];
	const out: Stroke[] = [];
	const hasWidthPrefixes = /\[\d+(?:\.\d+)?\]/.test(pathStr);
	if (hasWidthPrefixes) {
		const segments = pathStr.split(/\s*(?=\[\d)/);
		for (const seg of segments) {
			const m = seg.match(/^\[(\d+(?:\.\d+)?)\](.*)$/s);
			if (!m) continue;
			const width = Number(m[1]) || 6;
			const points = parsePointsFromPath(m[2]);
			if (points.length >= 1) out.push({ points, width });
		}
	} else {
		const points = parsePointsFromPath(pathStr);
		if (points.length >= 1) out.push({ points, width: 6 });
	}
	return out;
}

function parsePointsFromPath(pathStr: string): Point[] {
	const points: Point[] = [];
	// Strip out prefix headers if passed raw by accident
	const cleanPath = pathStr.replace(/^\[\d+(?:\.\d+)?\]/, "");
	const cmdRegex = /([MmLlQq])\s*([^MmLlQqZz]*)/g;
	let match: RegExpExecArray | null;
	while ((match = cmdRegex.exec(cleanPath)) !== null) {
		const cmd = match[1];
		const nums = match[2]
			.trim()
			.split(/[\s,]+/)
			.filter(Boolean)
			.map(Number);
		if (cmd === "M" || cmd === "m" || cmd === "L" || cmd === "l") {
			for (let i = 0; i < nums.length; i += 2) {
				if (nums[i] !== undefined && nums[i + 1] !== undefined)
					points.push([nums[i], nums[i + 1]]);
			}
		} else if (cmd === "Q" || cmd === "q") {
			for (let i = 0; i < nums.length; i += 4) {
				if (nums[i] !== undefined && nums[i + 1] !== undefined)
					points.push([nums[i], nums[i + 1]]);
			}
		}
	}
	return points;
}
</script>

<style scoped>
ion-modal.liquid-sketch-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto;
  --max-height: 96vh;
  --background: var(--ion-color-tertiary);
}

ion-modal.liquid-sketch-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>