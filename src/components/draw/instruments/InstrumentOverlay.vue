<template>
  <svg
    v-if="geometry && canvasReady"
    ref="overlayEl"
    class="instrument-overlay absolute inset-0 z-[8] w-full h-full pointer-events-none overflow-visible"
    aria-hidden="true"
    @wheel="forwardWheel"
  >
    <g v-if="rulerView" :transform="rulerView.transform">
      <rect
        :x="-rulerView.length / 2"
        :y="-rulerView.width / 2"
        :width="rulerView.length"
        :height="rulerView.width"
        rx="10"
        class="instrument-fill"
      />
      <!-- The inset body is the manipulation surface. The edge bands remain
           pointer-transparent so a brush can still begin a constrained stroke. -->
      <rect
        :x="-rulerView.length / 2 + 24"
        :y="-rulerView.width / 2 + 17"
        :width="Math.max(24, rulerView.length - 48)"
        :height="Math.max(20, rulerView.width - 34)"
        rx="8"
        class="instrument-drag-surface"
        @pointerdown="startGesture"
        @pointermove="updateGesture"
        @pointerup="endGesture"
        @pointercancel="endGesture"
        @lostpointercapture="endGesture"
      />
      <line
        :x1="-rulerView.length / 2"
        :x2="rulerView.length / 2"
        :y1="-rulerView.width / 2"
        :y2="-rulerView.width / 2"
        class="instrument-edge"
      />
      <line
        :x1="-rulerView.length / 2"
        :x2="rulerView.length / 2"
        :y1="rulerView.width / 2"
        :y2="rulerView.width / 2"
        class="instrument-edge"
      />
      <line
        v-for="tick in rulerTicks"
        :key="tick"
        :x1="tick"
        :x2="tick"
        :y1="-rulerView.width / 2"
        :y2="-rulerView.width / 2 + (tick % 50 === 0 ? 18 : 10)"
        class="instrument-tick"
      />

      <circle
        :cx="-rulerView.length / 2 + 22"
        cy="0"
        r="14"
        class="instrument-handle ruler-transform-handle"
        @pointerdown="startHandle('ruler-transform', $event)"
        @pointermove="updateHandle"
        @pointerup="endHandle"
        @pointercancel="endHandle"
        @lostpointercapture="endHandle"
      />
      <circle
        :cx="rulerView.length / 2 - 22"
        cy="0"
        r="14"
        class="instrument-handle ruler-transform-handle"
        @pointerdown="startHandle('ruler-transform', $event)"
        @pointermove="updateHandle"
        @pointerup="endHandle"
        @pointercancel="endHandle"
        @lostpointercapture="endHandle"
      />

      <!-- A midpoint control remains reachable when a viewport-spanning ruler
           puts both transform handles off screen. -->
      <line
        x1="0"
        :y1="-rulerView.width / 2"
        x2="0"
        :y2="-rulerView.width / 2 - 27"
        class="rotate-control-stem"
      />
      <circle
        cx="0"
        :cy="-rulerView.width / 2 - 28"
        r="14"
        class="instrument-handle rotate-handle"
        @pointerdown="startHandle('rotate', $event)"
        @pointermove="updateHandle"
        @pointerup="endHandle"
        @pointercancel="endHandle"
        @lostpointercapture="endHandle"
      />
    </g>

    <g v-else-if="compassView">
      <circle
        :cx="compassView.center.x"
        :cy="compassView.center.y"
        :r="compassView.radius"
        class="compass-fill"
      />
      <circle
        :cx="compassView.center.x"
        :cy="compassView.center.y"
        :r="Math.max(28, compassView.radius - 24)"
        class="instrument-drag-surface"
        @pointerdown="startGesture"
        @pointermove="updateGesture"
        @pointerup="endGesture"
        @pointercancel="endGesture"
        @lostpointercapture="endGesture"
      />
      <circle
        :cx="compassView.center.x"
        :cy="compassView.center.y"
        :r="compassView.radius"
        class="instrument-edge compass-edge"
      />
      <line
        :x1="compassView.center.x"
        :x2="compassView.handle.x"
        :y1="compassView.center.y"
        :y2="compassView.handle.y"
        class="instrument-tick compass-radius"
      />

      <circle
        :cx="compassView.handle.x"
        :cy="compassView.handle.y"
        r="16"
        class="instrument-handle radius-handle"
        @pointerdown="startHandle('radius', $event)"
        @pointermove="updateHandle"
        @pointerup="endHandle"
        @pointercancel="endHandle"
        @lostpointercapture="endHandle"
      />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useDrawStore } from "@/draw/session/draw.store";
import { useInstrumentStore } from "@/draw/tools/instruments/instrument.store";
import type {
	InstrumentGeometry,
	InstrumentPoint,
} from "@/draw/tools/instruments/instrumentGeometry";
import { compassRadiusHandlePoint } from "@/draw/tools/instruments/instrumentViewport";
import { forwardInstrumentWheel } from "@/draw/tools/instruments/instrumentWheel";

type HandleKind = "rotate" | "ruler-transform" | "radius";

interface ClientSample {
	clientX: number;
	clientY: number;
}

interface GestureBaseline {
	geometry: InstrumentGeometry;
	points: Map<number, InstrumentPoint>;
}

const instruments = useInstrumentStore();
const { geometry } = storeToRefs(instruments);
const drawStore = useDrawStore();
const { isCanvasInitialized } = storeToRefs(drawStore);
const viewportRevision = ref(0);
const overlayEl = ref<SVGSVGElement | null>(null);
/** Latest client coordinate per pointer. Scene conversion happens once per
 *  frame — a touch stream can deliver 120 samples/s, and every conversion plus
 *  every `setCenter` forces layout. */
const activePointers = new Map<number, ClientSample>();
let gestureBaseline: GestureBaseline | null = null;
let activeHandle: {
	kind: HandleKind;
	pointerId: number;
	geometry: InstrumentGeometry;
	startPoint: InstrumentPoint;
} | null = null;
let pendingHandleSample: ClientSample | null = null;
let frameId: number | null = null;
let attachedCanvas: ReturnType<typeof drawStore.getCanvas> | null = null;

const canvasReady = computed(
	() => isCanvasInitialized.value && !!attachedCanvas,
);

function refreshViewport() {
	viewportRevision.value++;
	instruments.ensureInViewport();
}

function attachCanvas() {
	detachCanvas();
	if (!isCanvasInitialized.value) return;
	attachedCanvas = drawStore.getCanvas();
	attachedCanvas.on("viewport:changed", refreshViewport);
	attachedCanvas.on("zoomChanged", refreshViewport);
	attachedCanvas.on("zoomReset", refreshViewport);
	attachedCanvas.on("gestureEnd", refreshViewport);
	refreshViewport();
}

function detachCanvas() {
	if (!attachedCanvas) return;
	attachedCanvas.off("viewport:changed", refreshViewport);
	attachedCanvas.off("zoomChanged", refreshViewport);
	attachedCanvas.off("zoomReset", refreshViewport);
	attachedCanvas.off("gestureEnd", refreshViewport);
	attachedCanvas = null;
}

watch(isCanvasInitialized, attachCanvas, { immediate: true });
onBeforeUnmount(() => {
	detachCanvas();
	overlayEl.value?.removeEventListener("touchmove", guardTouchMove);
	if (frameId !== null) cancelAnimationFrame(frameId);
	frameId = null;
});

function viewportState() {
	void viewportRevision.value;
	const vpt = attachedCanvas?.viewportTransform;
	if (!vpt) return null;
	return { vpt, zoom: Math.max(0.001, Math.hypot(vpt[0], vpt[1])) };
}

function toViewport(point: { x: number; y: number }) {
	const state = viewportState();
	if (!state) return { x: 0, y: 0 };
	const { vpt } = state;
	return {
		x: vpt[0] * point.x + vpt[2] * point.y + vpt[4],
		y: vpt[1] * point.x + vpt[3] * point.y + vpt[5],
	};
}

const rulerView = computed(() => {
	const state = viewportState();
	if (!state) return null;
	const displayed = instruments.displayGeometry();
	if (displayed?.type !== "ruler") return null;
	const center = toViewport(displayed.center);
	return {
		length: displayed.length * state.zoom,
		width: displayed.width * state.zoom,
		transform: `translate(${center.x} ${center.y}) rotate(${(displayed.angle * 180) / Math.PI})`,
	};
});

const rulerTicks = computed(() => {
	const view = rulerView.value;
	if (!view) return [];
	const ticks: number[] = [];
	const first = Math.ceil(-view.length / 2 / 25) * 25;
	for (let x = first; x < view.length / 2; x += 25) ticks.push(x);
	return ticks;
});

const compassView = computed(() => {
	const state = viewportState();
	if (!state) return null;
	const displayed = instruments.displayGeometry();
	if (displayed?.type !== "compass") return null;
	const center = toViewport(displayed.center);
	const radius = displayed.radius * state.zoom;
	const viewport = {
		width: overlayEl.value?.clientWidth ?? 1,
		height: overlayEl.value?.clientHeight ?? 1,
	};
	return {
		center,
		radius,
		handle: compassRadiusHandlePoint(center, radius, viewport),
	};
});

function sampleFromEvent(event: PointerEvent): ClientSample {
	return { clientX: event.clientX, clientY: event.clientY };
}

function pointFromSample(sample: ClientSample): InstrumentPoint | null {
	return instruments.scenePointFromClient(sample.clientX, sample.clientY);
}

function stopInstrumentEvent(event: PointerEvent) {
	event.preventDefault();
	event.stopPropagation();
}

function scheduleFrame() {
	if (frameId !== null) return;
	frameId = requestAnimationFrame(() => {
		frameId = null;
		applyPending();
	});
}

function flushFrame() {
	if (frameId !== null) {
		cancelAnimationFrame(frameId);
		frameId = null;
	}
	applyPending();
}

function applyPending() {
	applyHandle();
	applyGesture();
}

/**
 * Blink ignores `touch-action` on SVG child elements, so the drag surface alone
 * cannot stop the browser from claiming the touch as a scroll — it did, and the
 * resulting `pointercancel` killed every drag a few pixels in. `touch-action`
 * on the SVG root covers Blink; this non-passive `touchmove` guard covers
 * engines that resolve the property against the shape instead.
 */
function guardTouchMove(event: TouchEvent) {
	if (activePointers.size === 0 && !activeHandle) return;
	if (event.cancelable) event.preventDefault();
}

watch(overlayEl, (element, previous) => {
	previous?.removeEventListener("touchmove", guardTouchMove);
	element?.addEventListener("touchmove", guardTouchMove, { passive: false });
});

/**
 * The draggable SVG sits above Fabric's upper canvas. Wheel events over its
 * interactive regions therefore never reach Fabric's mouse:wheel listener
 * naturally, so replay the wheel at the same viewport coordinate on the
 * canvas. Edge bands remain pointer-transparent and already zoom normally.
 */
function forwardWheel(event: WheelEvent) {
	if (!attachedCanvas) return;
	forwardInstrumentWheel(event, attachedCanvas.upperCanvasEl);
}

function capturePointer(event: PointerEvent) {
	try {
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
	} catch {
		// Capture is an optimisation here — implicit touch capture already keeps
		// the stream on this element, and Safari rejects it on some SVG shapes.
	}
}

function startHandle(kind: HandleKind, event: PointerEvent) {
	stopInstrumentEvent(event);
	const point = pointFromSample(sampleFromEvent(event));
	const displayed = instruments.displayGeometry();
	if (!point || !displayed) return;
	activeHandle = {
		kind,
		pointerId: event.pointerId,
		geometry: copyGeometry(displayed),
		startPoint: point,
	};
	capturePointer(event);
	updateHandle(event);
}

function updateHandle(event: PointerEvent) {
	if (!activeHandle || activeHandle.pointerId !== event.pointerId) return;
	stopInstrumentEvent(event);
	pendingHandleSample = sampleFromEvent(event);
	scheduleFrame();
}

function applyHandle() {
	const sample = pendingHandleSample;
	pendingHandleSample = null;
	if (!activeHandle || !sample) return;
	const point = pointFromSample(sample);
	if (!point || !geometry.value) return;
	const base = activeHandle.geometry;
	const startVector = {
		x: activeHandle.startPoint.x - base.center.x,
		y: activeHandle.startPoint.y - base.center.y,
	};
	const currentVector = {
		x: point.x - base.center.x,
		y: point.y - base.center.y,
	};
	if (
		(activeHandle.kind === "rotate" ||
			activeHandle.kind === "ruler-transform") &&
		base.type === "ruler"
	) {
		const angleDelta =
			Math.atan2(currentVector.y, currentVector.x) -
			Math.atan2(startVector.y, startVector.x);
		if (activeHandle.kind === "ruler-transform") {
			const startDistance = Math.max(
				0.001,
				Math.hypot(startVector.x, startVector.y),
			);
			const currentDistance = Math.hypot(currentVector.x, currentVector.y);
			instruments.setRulerLength(
				base.length * (currentDistance / startDistance),
			);
		}
		instruments.setRulerAngle(base.angle + angleDelta);
	} else if (activeHandle.kind === "radius" && base.type === "compass") {
		const startDistance = Math.max(
			0.001,
			Math.hypot(startVector.x, startVector.y),
		);
		const currentDistance = Math.hypot(currentVector.x, currentVector.y);
		instruments.setCompassRadius(
			base.radius * (currentDistance / startDistance),
		);
	}
}

function endHandle(event: PointerEvent) {
	if (!activeHandle || activeHandle.pointerId !== event.pointerId) return;
	stopInstrumentEvent(event);
	flushFrame();
	if (event.type !== "lostpointercapture") {
		try {
			(event.currentTarget as Element).releasePointerCapture(event.pointerId);
		} catch {
			// Capture may already have been released by the browser.
		}
	}
	activeHandle = null;
	pendingHandleSample = null;
}

function copyGeometry(value: InstrumentGeometry): InstrumentGeometry {
	return { ...value, center: { ...value.center } };
}

function resetGestureBaseline() {
	const displayed = instruments.displayGeometry();
	if (!displayed) {
		gestureBaseline = null;
		return;
	}
	const points = new Map<number, InstrumentPoint>();
	for (const [id, sample] of activePointers) {
		const point = pointFromSample(sample);
		if (point) points.set(id, point);
	}
	gestureBaseline = { geometry: copyGeometry(displayed), points };
}

function startGesture(event: PointerEvent) {
	stopInstrumentEvent(event);
	capturePointer(event);
	activePointers.set(event.pointerId, sampleFromEvent(event));
	resetGestureBaseline();
}

function updateGesture(event: PointerEvent) {
	if (!activePointers.has(event.pointerId)) return;
	stopInstrumentEvent(event);
	activePointers.set(event.pointerId, sampleFromEvent(event));
	scheduleFrame();
}

function applyGesture() {
	if (!gestureBaseline || activePointers.size === 0) return;

	const ids = [...activePointers.keys()].slice(0, 2);
	const currentA = pointFromSample(activePointers.get(ids[0]) as ClientSample);
	const startA = gestureBaseline.points.get(ids[0]);
	if (!currentA || !startA) return;
	const base = gestureBaseline.geometry;

	if (ids.length === 1) {
		instruments.setCenter({
			x: base.center.x + currentA.x - startA.x,
			y: base.center.y + currentA.y - startA.y,
		});
		return;
	}

	const currentB = pointFromSample(activePointers.get(ids[1]) as ClientSample);
	const startB = gestureBaseline.points.get(ids[1]);
	if (!currentB || !startB) return;
	const startDistance = Math.max(
		0.001,
		Math.hypot(startB.x - startA.x, startB.y - startA.y),
	);
	const currentDistance = Math.hypot(
		currentB.x - currentA.x,
		currentB.y - currentA.y,
	);
	const scale = currentDistance / startDistance;
	const startMidpoint = {
		x: (startA.x + startB.x) / 2,
		y: (startA.y + startB.y) / 2,
	};
	const currentMidpoint = {
		x: (currentA.x + currentB.x) / 2,
		y: (currentA.y + currentB.y) / 2,
	};

	if (base.type === "ruler") {
		const angleDelta =
			Math.atan2(currentB.y - currentA.y, currentB.x - currentA.x) -
			Math.atan2(startB.y - startA.y, startB.x - startA.x);
		instruments.setRulerLength(base.length * scale);
		instruments.setRulerAngle(base.angle + angleDelta);
	} else {
		instruments.setCompassRadius(base.radius * scale);
	}
	instruments.setCenter({
		x: base.center.x + currentMidpoint.x - startMidpoint.x,
		y: base.center.y + currentMidpoint.y - startMidpoint.y,
	});
}

function endGesture(event: PointerEvent) {
	if (!activePointers.has(event.pointerId)) return;
	stopInstrumentEvent(event);
	flushFrame();
	activePointers.delete(event.pointerId);
	if (event.type !== "lostpointercapture") {
		try {
			(event.currentTarget as Element).releasePointerCapture(event.pointerId);
		} catch {
			// Capture may already have been released by the browser.
		}
	}
	if (activePointers.size > 0) resetGestureBaseline();
	else gestureBaseline = null;
}
</script>

<style scoped>
/* Blink resolves touch-action against boxes, not SVG shapes: without it here
   the browser scrolls instead of letting the drag surface move the instrument. */
.instrument-overlay {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.instrument-fill,
.compass-fill {
  fill: color-mix(in srgb, var(--ion-color-primary) 55%, transparent);
  stroke: color-mix(in srgb, var(--ion-color-dark) 24%, transparent);
  stroke-width: 1;
  pointer-events: none;
}

.compass-fill {
  fill: color-mix(in srgb, var(--ion-color-primary) 20%, transparent);
}

.instrument-edge {
  fill: none;
  stroke: var(--ion-color-secondary);
  stroke-width: 3;
  stroke-linecap: round;
  pointer-events: none;
}

.compass-edge {
  stroke-dasharray: 9 6;
}

.instrument-tick {
  stroke: color-mix(in srgb, var(--ion-color-dark) 45%, transparent);
  stroke-width: 1.5;
  pointer-events: none;
}

.compass-radius {
  stroke-dasharray: 4 5;
}

.rotate-control-stem {
  stroke: var(--ion-color-secondary);
  stroke-width: 3;
  pointer-events: none;
}

.instrument-handle {
  pointer-events: auto;
  touch-action: none;
  fill: var(--ion-color-tertiary);
  stroke: var(--ion-color-secondary);
  stroke-width: 4;
  filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.25));
  cursor: grab;
}

.instrument-drag-surface {
  fill: transparent;
  pointer-events: all;
  touch-action: none;
  cursor: move;
}

.instrument-handle:active {
  cursor: grabbing;
}

.rotate-handle,
.ruler-transform-handle,
.radius-handle {
  fill: var(--ion-color-secondary);
  stroke: var(--ion-color-tertiary);
}
</style>
