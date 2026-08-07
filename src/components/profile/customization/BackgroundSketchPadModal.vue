<template>
  <ion-modal
    :is-open="isOpen"
    @did-dismiss="handleDismiss"
    @will-present="onPresent"
    class="liquid-sketch-modal"
  >
    <div
      class="editor-root relative h-full w-full overflow-hidden select-none"
      :style="{ background: 'var(--ion-color-tertiary)' }"
    >
      <div
        ref="viewportRef"
        class="absolute inset-0 touch-none"
        :class="tool === 'erase' ? 'cursor-cell' : 'cursor-crosshair'"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel.prevent="onWheel"
      >
        <div
          ref="worldRef"
          class="absolute top-0 left-0 origin-top-left will-change-transform"
          :style="worldStyle"
        >
          <div
            ref="cardWrapperRef"
            class="relative"
            :style="{ width: `${CANONICAL_CARD_WIDTH}px` }"
          >
            <div class="pointer-events-none" :style="{ opacity: cardOpacity }">
              <!-- disable-ambient drops ProfileWorld + ProfileEffect entirely.
                   Those are dozens of separate compositor layers (sprite canvases,
                   blur, mix-blend); freezing their animation doesn't help — the
                   cost is the GPU re-compositing all of them every frame the live
                   stroke repaints. Collapsing to a single flat card layer is what
                   makes drawing/zoom buttery. The theme bg + avatar + name (the
                   things you actually trace around) stay. -->
              <ProfileCard
                :user="user || {}"
                :customization="cardCustomization"
                :is-own-profile="false"
                :is-preview="true"
                :static-world="true"
                :static-avatar-decoration="true"
                :disable-ambient="true"
              />
            </div>

            <div
              ref="padRef"
              class="absolute pointer-events-none overflow-hidden"
              :style="{
                top: `${zoneRenderTop}px`,
                left: `${zoneRenderLeft}px`,
                width: `${zoneRenderWidth}px`,
                height: `${zoneRenderHeight}px`,
              }"
            >
              <!-- COMMITTED strokes only. SVG keeps them VECTOR → crisp at any
                   zoom; `non-scaling-stroke` holds width constant in the pad's
                   space (then the world scale makes it grow with zoom, matching
                   the live canvas). Cached via `committedPaths`, so this re-renders
                   only on commit/erase/undo — never during a drag. The in-progress
                   stroke is drawn on the screen-space canvas overlay below. -->
              <svg
                v-if="zoneRenderWidth > 0"
                class="absolute inset-0 w-full h-full"
                :viewBox="`0 0 ${CANONICAL_ZONE_WIDTH} ${CANONICAL_ZONE_HEIGHT}`"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  v-for="(p, i) in committedPaths"
                  :key="i"
                  :d="p.d"
                  fill="none"
                  :stroke="strokeColor"
                  :stroke-width="p.width"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  vector-effect="non-scaling-stroke"
                  :opacity="EDIT_OPACITY"
                />
              </svg>
            </div>

            <div
              v-if="zoneRenderWidth > 0"
              class="absolute pointer-events-none border-2 border-dashed rounded-md"
              :style="{
                top: `${zoneRenderTop}px`,
                left: `${zoneRenderLeft}px`,
                width: `${zoneRenderWidth}px`,
                height: `${zoneRenderHeight}px`,
                borderColor: strokeColor,
                opacity: 0.3,
              }"
            ></div>
          </div>
        </div>

        <!-- LIVE-STROKE OVERLAY: screen-space canvas, OUTSIDE the zoomed world.
             Redrawn on rAF (O(n) raster, no DOM/`d`-string reparse — that
             reparse was the O(n²) ramp on long detailed strokes). Zoom/pan is
             folded into the point mapping, so raster cost is flat at any zoom.
             Width/position match the committed in-world SVG → seamless pen-up. -->
        <canvas
          ref="liveCanvasRef"
          class="absolute inset-0 w-full h-full pointer-events-none"
        ></canvas>

        <div
          v-if="tool === 'erase' && eraserCursor.visible"
          class="absolute pointer-events-none rounded-full border-2 border-dashed -translate-x-1/2 -translate-y-1/2"
          :style="{
            left: `${eraserCursor.x}px`,
            top: `${eraserCursor.y}px`,
            width: `${eraserCursor.size}px`,
            height: `${eraserCursor.size}px`,
            borderColor: 'var(--ion-color-secondary)',
            background: 'rgba(var(--ion-color-secondary-rgb), 0.12)',
          }"
        ></div>
      </div>

      <div class="absolute top-0 inset-x-0 z-20 px-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div class="relative h-12 flex items-center justify-center">
          <ion-button
            fill="clear"
            color="dark"
            class="absolute left-0 ion-no-margin"
            @click="handleDismiss"
          >
            <ion-icon slot="icon-only" :icon="svg(mdiClose)" class="text-xl" />
          </ion-button>

          <div class="text-center">
            <h1
              class="text-3xl text-secondary leading-none"
              :style="{ fontFamily: SKETCH_FONT }"
            >
              Card Doodle
            </h1>
            <p class="text-[9px] font-bold opacity-50 uppercase tracking-widest mt-0.5">
              Draw around your avatar &amp; name
            </p>
          </div>
        </div>
      </div>

      <div
        class="absolute z-20 inset-x-0 bottom-0 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pointer-events-none">
        <div
          class="pointer-events-auto rounded-3xl bg-white/95 border border-white/60 shadow-lg px-3 py-2 flex flex-col gap-2">

          <div class="flex items-center gap-1">
            <ion-button fill="clear" color="dark" class="ion-no-margin h-9 w-9" :disabled="!canUndo" @click="undo">
              <ion-icon slot="icon-only" :icon="svg(mdiUndoVariant)" class="text-xl" />
            </ion-button>
            <ion-button fill="clear" color="dark" class="ion-no-margin h-9 w-9" :disabled="!canRedo" @click="redo">
              <ion-icon slot="icon-only" :icon="svg(mdiRedoVariant)" class="text-xl" />
            </ion-button>

            <span class="text-[14px] cabin-sketch-regular ml-2">
              Pinch to zoom / drag to pan
            </span>

            <ion-button fill="clear" color="medium" size="small" class="ion-no-margin ml-auto pr-1"
                        @click="fitView(true)">
              <ion-icon slot="start" :icon="svg(mdiFitToScreenOutline)" class="text-lg mr-2" />
              <span class="text-[11px] font-bold tabular-nums">{{ zoomPct }}%</span>
            </ion-button>
          </div>

          <div class="flex items-center gap-3 px-0.5">
            <div class="custom-toggle-group shrink-0">
              <button
                type="button"
                class="toggle-btn"
                :class="{ active: tool === 'draw' }"
                @click="tool = 'draw'"
              >
                <ion-icon :icon="svg(mdiBrush)" class="text-base" />
              </button>
              <button
                type="button"
                class="toggle-btn"
                :class="{ active: tool === 'erase' }"
                @click="tool = 'erase'"
              >
                <ion-icon :icon="svg(mdiEraser)" class="text-base" />
              </button>
            </div>

            <span
              class="block rounded-full shrink-0 transition-all duration-100"
              :style="{
                width: `${sizeDotPx}px`,
                height: `${sizeDotPx}px`,
                backgroundColor: tool === 'erase' ? 'var(--ion-color-medium)' : strokeColor,
              }"
            ></span>

            <ion-range
              v-model="brushWidth"
              :min="MIN_BRUSH"
              :max="MAX_BRUSH"
              :step="1"
              color="secondary"
              class="flex-1 min-w-0 liquid-range"
            />

            <span class="text-[11px] font-bold tabular-nums text-dark/50 w-5 text-right shrink-0">
              {{ brushWidth }}
            </span>
          </div>

          <div class="flex items-center gap-2 mt-0.5">
            <ion-button
              fill="clear"
              color="medium"
              class="flex-1 ion-no-margin"
              :disabled="strokes.length === 0 && !isDrawing"
              @click="clear"
            >
              Clear
            </ion-button>

            <ion-button
              color="secondary"
              shape="round"
              class="flex-1 ion-no-margin"
              @click="applyOrUpgrade"
            >
              <template v-if="isPro || strokes.length === 0">
                Apply
              </template>

              <template v-else>
                <ion-icon slot="start" :icon="svg(mdiLock)" />
                Unlock Pro
              </template>
            </ion-button>
          </div>

          <p
            v-if="!isPro && strokes.length > 0"
            class="text-center text-[9px] font-bold text-secondary/70 uppercase tracking-widest pb-0.5 flex items-center justify-center gap-1"
          >
            <ion-icon :icon="svg(mdiLock)" class="text-xs" />
            Unlock Pro to save your doodle
          </p>
        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal, IonRange } from "@ionic/vue";
import {
	mdiBrush,
	mdiClose,
	mdiEraser,
	mdiFitToScreenOutline,
	mdiLock,
	mdiRedoVariant,
	mdiUndoVariant,
} from "@mdi/js";
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import ProfileCard from "@/components/profile/ProfileCard.vue";
import {
	type Customization,
	hydrateCustomization,
	resolveTheme,
} from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";
import { useAmbientPause } from "@/store/ambientPause.store";
import { useSubscriptionStore } from "@/store/subscription.store";

type Point = [number, number];
type Stroke = { points: Point[]; width: number };
type Tool = "draw" | "erase";

const CANONICAL_CARD_WIDTH = 360;
const CANONICAL_ZONE_WIDTH = ref(0);
const CANONICAL_ZONE_HEIGHT = ref(0);

const MIN_BRUSH = 2;
const MAX_BRUSH = 28;
const MIN_SCALE = 0.35;
const MAX_SCALE = 10;

const SKETCH_FONT = '"Cabin Sketch", cursive';
const EDIT_OPACITY = 0.35;

const props = defineProps<{
	isOpen: boolean;
	color?: string;
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

// While the doodle pad is up it covers the whole app. Freeze every ambient
// world/effect elsewhere (the profile page underneath) so all GPU/CPU goes to a
// buttery draw surface. Balanced on the isOpen edge — idempotent across the
// button→emit→did-dismiss double-fire.
const ambient = useAmbientPause();
let ambientHeld = false;
watch(
	() => props.isOpen,
	(open) => {
		if (open && !ambientHeld) {
			ambient.hold();
			ambientHeld = true;
		} else if (!open && ambientHeld) {
			ambient.release();
			ambientHeld = false;
		}
	},
	{ immediate: true },
);

/* ----------------------------- tools ----------------------------- */
const tool = ref<Tool>("draw");
const brushWidth = ref<number>(8);
const cardOpacity = 0.4;

const sizeDotPx = computed(() => Math.max(6, Math.min(22, brushWidth.value)));

/* ----------------------------- refs ------------------------------ */
const viewportRef = ref<HTMLElement | null>(null);
const worldRef = ref<HTMLElement | null>(null);
const cardWrapperRef = ref<HTMLElement | null>(null);
const padRef = ref<HTMLElement | null>(null);
const liveCanvasRef = ref<HTMLCanvasElement | null>(null);
let liveCtx: CanvasRenderingContext2D | null = null;
let liveRaf = 0;

/* --------------------------- zone layout -------------------------- */
const zoneRenderTop = ref(0);
const zoneRenderLeft = ref(0);
const zoneRenderWidth = ref(0);
const zoneRenderHeight = ref(0);

/* --------------------------- view transform ----------------------- */
const scale = ref(1);
const tx = ref(0);
const ty = ref(0);

const worldStyle = computed(() => ({
	transform: `translate3d(${tx.value}px, ${ty.value}px, 0) scale(${scale.value})`,
}));
const zoomPct = computed(() => Math.round(scale.value * 100));

/* --------------------------- stroke state ------------------------- */
const strokes = ref<Stroke[]>([]);
// The in-progress stroke is a PLAIN (non-reactive) array. Points are pushed on
// every pointermove and painted onto the screen-space canvas overlay via an
// rAF-batched drawLive() — deliberately outside Vue's reactivity so a fast drag
// never triggers a component re-render (that reactive churn was the real "lag").
let activePoints: Point[] = [];
const isDrawing = ref(false);

/* -------- live-stroke canvas overlay (screen space) -------- */
// CSS-pixel size of the live canvas, cached at (re)size time so drawLive never
// calls getBoundingClientRect — that forced layout ran EVERY rAF of a drag.
let liveW = 0;
let liveH = 0;

const sizeLiveOverlay = () => {
	if (!liveCanvasRef.value || !viewportRef.value) return;
	const dpr = window.devicePixelRatio || 1;
	const r = viewportRef.value.getBoundingClientRect();
	if (r.width === 0 || r.height === 0) return;
	liveW = r.width;
	liveH = r.height;
	liveCanvasRef.value.width = Math.round(r.width * dpr);
	liveCanvasRef.value.height = Math.round(r.height * dpr);
	liveCtx = liveCanvasRef.value.getContext("2d", { desynchronized: true });
	if (liveCtx) {
		liveCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
		liveCtx.lineCap = "round";
		liveCtx.lineJoin = "round";
	}
};

const scheduleLive = () => {
	if (!liveRaf) liveRaf = requestAnimationFrame(drawLive);
};

// Wipe the live overlay IN THIS TASK. Used on commit: the committed SVG path
// appears in the same paint the reactive push triggers, so the live copy must
// vanish in that exact paint too. Clearing via the next rAF left one frame
// where BOTH were visible — 0.35 + 0.35 opacity stacked into a dark flash.
const clearLiveNow = () => {
	if (liveRaf) {
		cancelAnimationFrame(liveRaf);
		liveRaf = 0;
	}
	liveCtx?.clearRect(0, 0, liveW, liveH);
};

function drawLive() {
	liveRaf = 0;
	const ctx = liveCtx;
	if (!ctx || !liveCanvasRef.value) return;

	ctx.clearRect(0, 0, liveW, liveH);
	if (activePoints.length === 0) return;

	// Canonical → viewport: worldTranslate + worldScale·(padOffset + canonical).
	const s = scale.value;
	const offX = tx.value + s * zoneRenderLeft.value;
	const offY = ty.value + s * zoneRenderTop.value;

	ctx.globalAlpha = EDIT_OPACITY;
	ctx.strokeStyle = strokeColor.value;
	ctx.lineWidth = brushWidth.value * s; // match committed (non-scaling·worldScale)
	ctx.beginPath();

	const p0 = activePoints[0];
	ctx.moveTo(offX + s * p0[0], offY + s * p0[1]);
	if (activePoints.length === 1) {
		ctx.lineTo(offX + s * p0[0], offY + s * p0[1]);
	} else {
		for (let i = 1; i < activePoints.length - 1; i++) {
			const a = activePoints[i];
			const b = activePoints[i + 1];
			const mx = (a[0] + b[0]) / 2;
			const my = (a[1] + b[1]) / 2;
			ctx.quadraticCurveTo(
				offX + s * a[0],
				offY + s * a[1],
				offX + s * mx,
				offY + s * my,
			);
		}
		const last = activePoints[activePoints.length - 1];
		ctx.lineTo(offX + s * last[0], offY + s * last[1]);
	}
	ctx.stroke();
}

/* ----- colour ---------------------------------------------------- */
const effectiveCustomization = computed(() =>
	hydrateCustomization(props.customization || {}),
);
const theme = computed(() =>
	resolveTheme(effectiveCustomization.value.themeId),
);
const strokeColor = computed(
	() => theme.value.nameColor || props.color || "#1c1c1e",
);

/* --------------------------- history ------------------------------ */
const past = ref<Stroke[][]>([]);
const future = ref<Stroke[][]>([]);
const canUndo = computed(() => past.value.length > 0);
const canRedo = computed(() => future.value.length > 0);
let gestureSnapshot: string | null = null;

const cloneStrokes = (s: Stroke[]): Stroke[] =>
	s.map((st) => ({
		width: st.width,
		points: st.points.map((p) => [p[0], p[1]] as Point),
	}));

const beginHistory = () => {
	gestureSnapshot = JSON.stringify(strokes.value);
};
const commitHistory = () => {
	if (gestureSnapshot === null) return;
	if (gestureSnapshot !== JSON.stringify(strokes.value)) {
		past.value.push(JSON.parse(gestureSnapshot));
		future.value = [];
	}
	gestureSnapshot = null;
};
const undo = () => {
	if (!canUndo.value) return;
	future.value.push(cloneStrokes(strokes.value));
	strokes.value = past.value.pop()!;
};
const redo = () => {
	if (!canRedo.value) return;
	past.value.push(cloneStrokes(strokes.value));
	strokes.value = future.value.pop()!;
};

/* --------------------------- card preview ------------------------- */
const cardCustomization = computed(() => ({
	...(props.customization || {}),
	backgroundSketchPath: "",
	backgroundSketchViewBox: "",
}));

/* ================================================================== *
 * MEASUREMENT
 * ================================================================== */
let resizeObserver: ResizeObserver | null = null;

const measureZone = () => {
	const wrapper = cardWrapperRef.value;
	if (!wrapper) return;

	const zoneEl =
		wrapper.querySelector<HTMLElement>(".js-doodle-zone") ?? wrapper;

	const wRect = wrapper.getBoundingClientRect();
	const zRect = zoneEl.getBoundingClientRect();
	if (zRect.width === 0 || zRect.height === 0) return;

	const s = scale.value || 1;
	zoneRenderTop.value = Math.round((zRect.top - wRect.top) / s);
	zoneRenderLeft.value = Math.round((zRect.left - wRect.left) / s);
	zoneRenderWidth.value = Math.round(zRect.width / s);
	zoneRenderHeight.value = Math.round(zRect.height / s);

	if (CANONICAL_ZONE_WIDTH.value === 0) {
		CANONICAL_ZONE_WIDTH.value = zoneRenderWidth.value;
		CANONICAL_ZONE_HEIGHT.value = zoneRenderHeight.value;
	}
};

const cardIntrinsicHeight = () =>
	cardWrapperRef.value?.offsetHeight || CANONICAL_CARD_WIDTH * 1.4;

const fitView = (animate = false) => {
	const vp = viewportRef.value;
	if (!vp) return;
	const rect = vp.getBoundingClientRect();
	const margin = 28;
	const topReserve = 96;
	const bottomReserve = 170;
	const availW = rect.width - margin * 2;
	const availH = rect.height - topReserve - bottomReserve;
	const cardH = cardIntrinsicHeight();

	const next = clamp(
		Math.min(availW / CANONICAL_CARD_WIDTH, availH / cardH),
		MIN_SCALE,
		4,
	);

	const apply = () => {
		scale.value = next;
		tx.value = (rect.width - CANONICAL_CARD_WIDTH * next) / 2;
		ty.value = topReserve + Math.max(0, (availH - cardH * next) / 2);
	};

	if (animate && worldRef.value) {
		worldRef.value.style.transition =
			"transform 0.28s cubic-bezier(0.22,1,0.36,1)";
		apply();
		window.setTimeout(() => {
			if (worldRef.value) worldRef.value.style.transition = "";
		}, 300);
	} else {
		apply();
	}
};

/* ================================================================== *
 * LIFECYCLE
 * ================================================================== */
const onPresent = async () => {
	tool.value = "draw";
	scale.value = 1;
	tx.value = 0;
	ty.value = 0;
	CANONICAL_ZONE_WIDTH.value = 0;
	CANONICAL_ZONE_HEIGHT.value = 0;
	past.value = [];
	future.value = [];
	activePoints = [];
	isDrawing.value = false;

	await nextTick();
	measureZone();
	fitView();
	sizeLiveOverlay();
	scheduleLive();

	window.setTimeout(() => {
		measureZone();
		fitView();
		sizeLiveOverlay();
	}, 180);

	if (cardWrapperRef.value && typeof ResizeObserver !== "undefined") {
		resizeObserver?.disconnect();
		resizeObserver = new ResizeObserver(() => measureZone());
		resizeObserver.observe(cardWrapperRef.value);
		const zoneEl =
			cardWrapperRef.value.querySelector<HTMLElement>(".js-doodle-zone");
		if (zoneEl) resizeObserver.observe(zoneEl);
	}

	strokes.value = props.initialPath
		? parsePathToStrokes(props.initialPath)
		: [];
};

onBeforeUnmount(() => {
	resizeObserver?.disconnect();
	if (liveRaf) cancelAnimationFrame(liveRaf);
	if (eraseRaf) cancelAnimationFrame(eraseRaf);
	if (ambientHeld) {
		ambient.release();
		ambientHeld = false;
	}
});

watch(
	() => props.initialPath,
	(val) => {
		if (props.isOpen) {
			strokes.value = val ? parsePathToStrokes(val) : [];
			past.value = [];
			future.value = [];
		}
	},
);

/* ================================================================== *
 * POINTER / GESTURE ENGINE
 * ================================================================== */
const pointers = new Map<number, { x: number; y: number }>();
type GestureMode = "none" | "draw" | "transform" | "lock";
let mode: GestureMode = "none";

// Pad rect captured at the start of a draw/erase gesture and reused for every
// move — the pad can't move mid-stroke (pan/zoom take 2 pointers → transform
// mode cancels the stroke), so this drops a forced layout per pointermove.
let activeRect: DOMRect | null = null;

// Erase batching (see onPointerMove): latest pointer position + pending rAF.
let pendingErase: [number, number] | null = null;
let eraseRaf = 0;

let pinchStartDist = 0;
let pinchStartScale = 1;
let pinchAnchor = { wx: 0, wy: 0 };

const eraserCursor = reactive({ visible: false, x: 0, y: 0, size: 0 });

const vpRect = () =>
	viewportRef.value?.getBoundingClientRect() ?? new DOMRect();

// The pad renders at zoneRenderWidth (≈ canonical) × world scale, so px per
// canonical unit ≡ the world scale — no getBoundingClientRect per cursor move.
const pxPerCanonical = () => {
	if (!CANONICAL_ZONE_WIDTH.value) return scale.value;
	return (zoneRenderWidth.value / CANONICAL_ZONE_WIDTH.value) * scale.value;
};

const getPoint = (clientX: number, clientY: number): Point | null => {
	if (!padRef.value || CANONICAL_ZONE_WIDTH.value === 0) return null;
	const rect = activeRect ?? padRef.value.getBoundingClientRect();
	if (rect.width === 0) return null;
	const sx = CANONICAL_ZONE_WIDTH.value / rect.width;
	const sy = CANONICAL_ZONE_HEIGHT.value / rect.height;
	return [
		Number(((clientX - rect.left) * sx).toFixed(1)),
		Number(((clientY - rect.top) * sy).toFixed(1)),
	];
};

const twoPointers = () => {
	const it = pointers.values();
	const a = it.next().value!;
	const b = it.next().value!;
	return [a, b] as const;
};

const onPointerDown = (e: PointerEvent) => {
	viewportRef.value?.setPointerCapture(e.pointerId);
	pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

	if (pointers.size >= 2) {
		if (mode === "draw") cancelStroke();
		startPinch();
		mode = "transform";
		return;
	}

	if (mode === "lock") return;

	if (tool.value === "erase") {
		mode = "draw";
		beginHistory();
		activeRect = padRef.value?.getBoundingClientRect() ?? null;
		updateEraserCursor(e);
		eraseAt(e.clientX, e.clientY);
	} else {
		mode = "draw";
		beginHistory();
		activeRect = padRef.value?.getBoundingClientRect() ?? null;
		const p = getPoint(e.clientX, e.clientY);
		if (!p) {
			mode = "none";
			return;
		}
		isDrawing.value = true;
		activePoints = [p];
		scheduleLive();
	}
};

const onPointerMove = (e: PointerEvent) => {
	if (pointers.has(e.pointerId)) {
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
	}
	if (tool.value === "erase") updateEraserCursor(e);

	if (mode === "transform" && pointers.size >= 2) {
		updatePinch();
		return;
	}
	if (mode !== "draw") return;

	if (tool.value === "erase") {
		// rAF-batch the erase: pointermove can fire 120Hz+, and every eraseAt
		// walks all stroke points AND replaces the reactive array (full SVG
		// re-patch). One erase per painted frame is all the eye can see anyway.
		pendingErase = [e.clientX, e.clientY];
		if (!eraseRaf) {
			eraseRaf = requestAnimationFrame(() => {
				eraseRaf = 0;
				if (pendingErase && mode === "draw" && tool.value === "erase") {
					eraseAt(pendingErase[0], pendingErase[1]);
					pendingErase = null;
				}
			});
		}
		return;
	}

	if (!isDrawing.value) return;
	const p = getPoint(e.clientX, e.clientY);
	if (!p) return;
	const last = activePoints[activePoints.length - 1];
	if (last) {
		const dx = p[0] - last[0];
		const dy = p[1] - last[1];
		if (dx * dx + dy * dy < 1) return;
	}
	activePoints.push(p);
	scheduleLive();
};

const onPointerUp = (e: PointerEvent) => {
	viewportRef.value?.releasePointerCapture?.(e.pointerId);
	pointers.delete(e.pointerId);

	if (mode === "transform") {
		mode = pointers.size === 0 ? "none" : "lock";
		return;
	}
	if (mode === "lock") {
		if (pointers.size === 0) mode = "none";
		return;
	}

	if (mode === "draw") {
		if (tool.value === "erase") {
			// Flush the last batched erase so the final wisp isn't dropped.
			if (pendingErase) {
				eraseAt(pendingErase[0], pendingErase[1]);
				pendingErase = null;
			}
			if (eraseRaf) {
				cancelAnimationFrame(eraseRaf);
				eraseRaf = 0;
			}
			commitHistory();
			if (pointers.size === 0) eraserCursor.visible = false;
		} else if (isDrawing.value) {
			isDrawing.value = false;
			commitStroke();
		}
		if (pointers.size === 0) {
			mode = "none";
			activeRect = null;
		}
	}
};

const cancelStroke = () => {
	isDrawing.value = false;
	activePoints = [];
	clearLiveNow();
	gestureSnapshot = null;
	activeRect = null;
};

const commitStroke = () => {
	if (activePoints.length === 1) {
		strokes.value.push({
			points: [activePoints[0]],
			width: brushWidth.value,
		});
	} else if (activePoints.length > 1) {
		strokes.value.push({
			points: simplifyPath(activePoints, 0.75),
			width: brushWidth.value,
		});
	}
	// Synchronous wipe: committed SVG appears and the live copy disappears in
	// the SAME paint — an rAF-deferred clear double-drew for one frame (flash).
	activePoints = [];
	clearLiveNow();
	commitHistory();
};

/* ----------------------------- pinch ------------------------------ */
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
	Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
	x: (a.x + b.x) / 2,
	y: (a.y + b.y) / 2,
});

const startPinch = () => {
	const [a, b] = twoPointers();
	const center = mid(a, b);
	const rect = vpRect();
	pinchStartDist = dist(a, b) || 1;
	pinchStartScale = scale.value;
	pinchAnchor = {
		wx: (center.x - rect.left - tx.value) / scale.value,
		wy: (center.y - rect.top - ty.value) / scale.value,
	};
};

const updatePinch = () => {
	const [a, b] = twoPointers();
	const center = mid(a, b);
	const rect = vpRect();
	const factor = dist(a, b) / pinchStartDist;
	const next = clamp(pinchStartScale * factor, MIN_SCALE, MAX_SCALE);
	scale.value = next;
	tx.value = center.x - rect.left - pinchAnchor.wx * next;
	ty.value = center.y - rect.top - pinchAnchor.wy * next;
};

/* ----------------------------- wheel ------------------------------ */
const onWheel = (e: WheelEvent) => {
	const rect = vpRect();
	const px = e.clientX - rect.left;
	const py = e.clientY - rect.top;
	const wx = (px - tx.value) / scale.value;
	const wy = (py - ty.value) / scale.value;
	const k = e.ctrlKey ? 0.012 : 0.0016;
	const next = clamp(
		scale.value * Math.exp(-e.deltaY * k),
		MIN_SCALE,
		MAX_SCALE,
	);
	scale.value = next;
	tx.value = px - wx * next;
	ty.value = py - wy * next;
};

/* ----------------------------- high-fidelity eraser ----------------------------- */
const eraseRadius = () => Math.max(4, brushWidth.value * 0.9);

const updateEraserCursor = (e: PointerEvent) => {
	const rect = vpRect();
	eraserCursor.visible = true;
	eraserCursor.x = e.clientX - rect.left;
	eraserCursor.y = e.clientY - rect.top;
	eraserCursor.size = eraseRadius() * pxPerCanonical() * 2;
};

const eraseAt = (clientX: number, clientY: number) => {
	const p = getPoint(clientX, clientY);
	if (!p) return;
	const radius = eraseRadius();

	const nextStrokes: Stroke[] = [];
	let mutated = false;

	for (const stroke of strokes.value) {
		const r = radius + stroke.width / 2;
		const r2 = r * r;
		const pts = stroke.points;

		if (pts.length === 0) continue;

		if (pts.length === 1) {
			const dx = pts[0][0] - p[0];
			const dy = pts[0][1] - p[1];
			if (dx * dx + dy * dy <= r2) {
				mutated = true;
			} else {
				nextStrokes.push(stroke);
			}
			continue;
		}

		let currentSubPoints: Point[] = [];
		let strokeHitOccurred = false;
		const subStrokes: Stroke[] = [];

		// Check entry point
		const d0x = pts[0][0] - p[0];
		const d0y = pts[0][1] - p[1];
		if (d0x * d0x + d0y * d0y > r2) {
			currentSubPoints.push(pts[0]);
		} else {
			strokeHitOccurred = true;
		}

		for (let i = 0; i < pts.length - 1; i++) {
			const p1 = pts[i];
			const p2 = pts[i + 1];

			if (getSqSegDist(p, p1, p2) <= r2) {
				strokeHitOccurred = true;

				// INTERPOLATION ENGINE: Walk the segment and keep safe points
				const segDist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
				const steps = Math.max(1, Math.ceil(segDist / 2)); // ~2px granularity

				for (let j = 1; j <= steps; j++) {
					const t = j / steps;
					const ix = Number((p1[0] + (p2[0] - p1[0]) * t).toFixed(1));
					const iy = Number((p1[1] + (p2[1] - p1[1]) * t).toFixed(1));
					const dx = ix - p[0];
					const dy = iy - p[1];

					if (dx * dx + dy * dy > r2) {
						currentSubPoints.push([ix, iy]);
					} else if (currentSubPoints.length > 0) {
						subStrokes.push({
							points: currentSubPoints,
							width: stroke.width,
						});
						currentSubPoints = [];
					}
				}
			} else {
				if (currentSubPoints.length === 0) currentSubPoints.push(p1);
				currentSubPoints.push(p2);
			}
		}

		if (strokeHitOccurred) {
			mutated = true;
			if (currentSubPoints.length > 0) {
				subStrokes.push({ points: currentSubPoints, width: stroke.width });
			}
			nextStrokes.push(...subStrokes);
		} else {
			nextStrokes.push(stroke);
		}
	}

	if (mutated) {
		strokes.value = nextStrokes;
	}
};

/* ----------------------------- actions ---------------------------- */
const clear = () => {
	if (strokes.value.length === 0 && activePoints.length === 0) return;
	beginHistory();
	strokes.value = [];
	activePoints = [];
	clearLiveNow();
	commitHistory();
};

const save = () => {
	// Clearing (empty result) is allowed even for non-pro users, so a lapsed
	// subscriber can remove a doodle they set while pro. Saving NEW content
	// still requires pro.
	const isClearing = strokes.value.length === 0;
	if (!isPro.value && !isClearing) return;
	if (isClearing) {
		emit("save", { path: "", viewBox: "" });
		return;
	}
	const combinedPath = strokes.value
		.map((s) => `[${s.width}]${buildPath(s.points)}`)
		.join(" ");
	const viewBox = `0 0 ${CANONICAL_ZONE_WIDTH.value} ${CANONICAL_ZONE_HEIGHT.value}`;
	emit("save", { path: combinedPath, viewBox });
};

const handleDismiss = () => {
	activePoints = [];
	eraserCursor.visible = false;
	emit("close");
};

/* ================================================================== *
 * GEOMETRY HELPERS
 * ================================================================== */
const clamp = (v: number, lo: number, hi: number) =>
	Math.max(lo, Math.min(hi, v));

function getSqSegDist(p: Point, p1: Point, p2: Point): number {
	let x = p1[0];
	let y = p1[1];
	let dx = p2[0] - x;
	let dy = p2[1] - y;
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
	let maxSqDist = sqTolerance;
	let index = -1;
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

function simplifyPath(points: Point[], tolerance = 0.75): Point[] {
	if (points.length <= 2) return points;
	const sqTolerance = tolerance * tolerance;
	const simplified: Point[] = [points[0]];
	simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
	simplified.push(points[points.length - 1]);
	return simplified;
}

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

// Committed strokes' path `d` strings. Recomputes ONLY when `strokes` changes
// (commit / erase / undo / redo / clear), NOT while the in-progress stroke
// updates every pointermove — that live stroke is drawn on the screen-space
// canvas overlay instead. The WeakMap memoizes per stroke OBJECT: an erase
// drag replaces the array every move, but untouched strokes keep their
// identity, so only split/new sub-strokes pay buildPath — not the whole
// doodle, every move, O(total points).
const dCache = new WeakMap<Stroke, string>();
const strokeD = (s: Stroke): string => {
	let d = dCache.get(s);
	if (d === undefined) {
		d = buildPath(s.points);
		dCache.set(s, d);
	}
	return d;
};
const committedPaths = computed(() =>
	strokes.value.map((s) => ({ d: strokeD(s), width: s.width })),
);

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

const presentPaywall = () => {
	subscriptionStore.openPaywall();
};

const applyOrUpgrade = () => {
	// Non-pro may still apply an empty canvas (a clear); anything else upsells.
	if (!isPro.value && strokes.value.length > 0) {
		presentPaywall();
		return;
	}

	save();
};
</script>

<style scoped>
ion-modal.liquid-sketch-modal {
  --width: 100%;
  --height: 100%;
  --border-radius: 0;
  --background: var(--ion-color-tertiary);
}

/* Custom crisp tool toggle styling */
.custom-toggle-group {
  display: flex;
  background: rgba(var(--ion-color-light-rgb, 244, 245, 246), 0.85);
  padding: 3px;
  border-radius: 14px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 32px;
  border-radius: 11px;
  border: none;
  background: transparent;
  color: var(--ion-color-medium);
  transition: all 0.15s ease;
  cursor: pointer;
}

.toggle-btn.active {
  background: #ffffff;
  color: var(--ion-color-secondary);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.liquid-range {
  --bar-height: 5px;
  --knob-size: 20px;
  --height: 32px;
  padding: 0;
}

@media (prefers-reduced-motion: reduce) {
  * {
    transition: none !important;
  }
}
</style>
