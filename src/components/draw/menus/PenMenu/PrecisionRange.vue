<template>
  <div
    ref="trackElement"
    class="precision-range"
    :class="{ 'is-dragging': dragging, 'is-fine': fineDragging }"
    role="slider"
    tabindex="0"
    :aria-label="label"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="liveValue"
    :aria-valuetext="formattedValue"
    @pointerdown="startDrag"
    @keydown="onKeydown"
  >
    <span class="precision-track" aria-hidden="true">
      <span class="precision-fill" :style="fillStyle" />
    </span>
    <span
      v-for="tick in tickMarks"
      :key="tick.value"
      class="precision-tick"
      :style="{ left: `calc(9px + (100% - 18px) * ${tick.norm})` }"
      aria-hidden="true"
    />
    <span class="precision-knob" :style="knobStyle" aria-hidden="true" />

    <span
      v-if="dragging"
      class="precision-bubble"
      :style="knobStyle"
      aria-hidden="true"
    >
      {{ formattedValue }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
	FINE_DRAG_SENSITIVITY,
	normFromValue,
	PRECISION_DRAG_RELEASE_PX,
	PRECISION_DRAG_THRESHOLD_PX,
	type RangeCurve,
	rangeNormAtClientX,
	rangeUsableWidth,
	snapRangeValue,
	valueFromNorm,
} from "@/components/draw/menus/PenMenu/precisionRange";

interface Props {
	modelValue: number;
	min: number;
	max: number;
	step?: number;
	label: string;
	curve?: RangeCurve;
	/** Overrides `step` snapping — lets a track use a step that varies with
	 *  magnitude (tenths for liners, units for fills). */
	snapValue?: (value: number, min: number, max: number) => number;
	/** Values marked on the track as orientation points. */
	ticks?: number[];
	formatValue?: (value: number) => string;
}

const props = withDefaults(defineProps<Props>(), {
	step: 1,
	curve: "linear",
	snapValue: undefined,
	ticks: undefined,
	formatValue: (value: number) => String(value),
});
const emit = defineEmits<{ "update:modelValue": [value: number] }>();

const trackElement = ref<HTMLElement | null>(null);
const liveValue = ref(props.modelValue);
const dragging = ref(false);
const fineDragging = ref(false);
/**
 * The drag carries an unsnapped, unclamped track position. Re-deriving it from
 * the emitted value meant every sub-step pointer sample was rounded away — on
 * touch, where `clientX` is fractional, small moves simply vanished — and
 * clamping it would make a drag past either end refuse to come back.
 */
let dragState: {
	pointerId: number;
	anchorX: number;
	anchorNorm: number;
	norm: number;
	startY: number;
} | null = null;
let emitFrame: number | null = null;
let pendingValue: number | null = null;

watch(
	() => props.modelValue,
	(value) => {
		if (!dragging.value) liveValue.value = value;
	},
);

const progress = computed(() =>
	normFromValue(liveValue.value, props.min, props.max, props.curve),
);
const fillStyle = computed(() => ({ width: `${progress.value * 100}%` }));
const tickMarks = computed(() =>
	(props.ticks ?? [])
		.filter((value) => value > props.min && value < props.max)
		.map((value) => ({
			value,
			norm: normFromValue(value, props.min, props.max, props.curve),
		})),
);

function snap(value: number): number {
	return props.snapValue
		? props.snapValue(value, props.min, props.max)
		: snapRangeValue(value, props.min, props.max, props.step);
}

function valueAtNorm(norm: number): number {
	return snap(valueFromNorm(norm, props.min, props.max, props.curve));
}
const knobStyle = computed(() => ({
	left: `calc(9px + (100% - 18px) * ${progress.value})`,
}));
const formattedValue = computed(() => props.formatValue(liveValue.value));

function flushModelValue() {
	if (emitFrame !== null) cancelAnimationFrame(emitFrame);
	emitFrame = null;
	if (pendingValue === null) return;
	const value = pendingValue;
	pendingValue = null;
	emit("update:modelValue", value);
}

function updateValue(value: number, immediate = false) {
	liveValue.value = value;
	pendingValue = value;
	if (immediate) {
		flushModelValue();
		return;
	}
	if (emitFrame !== null) return;
	emitFrame = requestAnimationFrame(() => {
		emitFrame = null;
		if (pendingValue === null) return;
		const next = pendingValue;
		pendingValue = null;
		emit("update:modelValue", next);
	});
}

function attachGlobalDragListeners() {
	window.addEventListener("pointermove", updateDrag, true);
	window.addEventListener("pointerup", endDrag, true);
	window.addEventListener("pointercancel", endDrag, true);
	document.documentElement.classList.add("precision-range-dragging");
}

function detachGlobalDragListeners() {
	window.removeEventListener("pointermove", updateDrag, true);
	window.removeEventListener("pointerup", endDrag, true);
	window.removeEventListener("pointercancel", endDrag, true);
	document.documentElement.classList.remove("precision-range-dragging");
}

onBeforeUnmount(() => {
	detachGlobalDragListeners();
	if (emitFrame !== null) cancelAnimationFrame(emitFrame);
	emitFrame = null;
	pendingValue = null;
});

function startDrag(event: PointerEvent) {
	if (event.pointerType === "mouse" && event.button !== 0) return;
	const track = trackElement.value;
	if (!track) return;
	event.preventDefault();
	event.stopPropagation();
	track.focus({ preventScroll: true });
	track.setPointerCapture(event.pointerId);

	const rect = track.getBoundingClientRect();
	const norm = rangeNormAtClientX(event.clientX, rect.left, rect.width);
	updateValue(valueAtNorm(norm));
	dragState = {
		pointerId: event.pointerId,
		anchorX: event.clientX,
		anchorNorm: norm,
		norm,
		startY: event.clientY,
	};
	dragging.value = true;
	fineDragging.value = false;
	attachGlobalDragListeners();
}

function updateDrag(event: PointerEvent) {
	const state = dragState;
	const track = trackElement.value;
	if (!state || !track || state.pointerId !== event.pointerId) return;
	event.preventDefault();
	event.stopPropagation();

	const distanceFromTrack = Math.abs(event.clientY - state.startY);
	// Hysteresis prevents precision mode from rapidly toggling when the pointer
	// rests around the activation boundary.
	const fine = fineDragging.value
		? distanceFromTrack >= PRECISION_DRAG_RELEASE_PX
		: distanceFromTrack >= PRECISION_DRAG_THRESHOLD_PX;
	// Re-anchor on every sensitivity change so entering or leaving precision
	// mode continues from the current position instead of teleporting the knob.
	if (fine !== fineDragging.value) {
		state.anchorNorm = state.norm;
		state.anchorX = event.clientX;
		fineDragging.value = fine;
	}

	const usableWidth = rangeUsableWidth(track.getBoundingClientRect().width);
	const sensitivity = fine ? FINE_DRAG_SENSITIVITY : 1;
	state.norm = Math.max(
		-0.5,
		Math.min(
			1.5,
			state.anchorNorm +
				((event.clientX - state.anchorX) / usableWidth) * sensitivity,
		),
	);
	updateValue(valueAtNorm(state.norm));
}

function endDrag(event: PointerEvent) {
	const state = dragState;
	const track = trackElement.value;
	if (!state || state.pointerId !== event.pointerId) return;
	event.preventDefault();
	event.stopPropagation();
	if (track?.hasPointerCapture(event.pointerId)) {
		track.releasePointerCapture(event.pointerId);
	}
	dragState = null;
	flushModelValue();
	dragging.value = false;
	fineDragging.value = false;
	detachGlobalDragListeners();
}

/** One key press = one visible change, whatever the step is at this magnitude. */
function nudge(direction: 1 | -1, fraction: number): number {
	const base = liveValue.value;
	const norm = normFromValue(base, props.min, props.max, props.curve);
	for (let attempt = 1; attempt <= 20; attempt++) {
		const next = valueAtNorm(norm + direction * fraction * attempt);
		if (next !== base) return next;
	}
	return direction > 0 ? props.max : props.min;
}

function onKeydown(event: KeyboardEvent) {
	let next: number | null = null;
	if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
		next = nudge(-1, 0.01);
	} else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
		next = nudge(1, 0.01);
	} else if (event.key === "PageDown") {
		next = nudge(-1, 0.1);
	} else if (event.key === "PageUp") {
		next = nudge(1, 0.1);
	} else if (event.key === "Home") {
		next = props.min;
	} else if (event.key === "End") {
		next = props.max;
	}
	if (next === null) return;
	event.preventDefault();
	event.stopPropagation();
	updateValue(next, true);
}
</script>

<style scoped>
.precision-range {
  position: relative;
  min-width: 0;
  height: 28px;
  touch-action: none;
  cursor: pointer;
  outline: none;
}

.precision-track {
  position: absolute;
  left: 9px;
  right: 9px;
  top: 12px;
  height: 4px;
  overflow: hidden;
  border-radius: 8px;
  background: rgb(0 0 0 / 0.08);
}

.precision-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ion-color-secondary);
}

.precision-tick {
  position: absolute;
  top: 17px;
  width: 2px;
  height: 4px;
  border-radius: 1px;
  transform: translateX(-50%);
  background: rgb(0 0 0 / 0.18);
  pointer-events: none;
}

.precision-knob,
.precision-bubble {
  position: absolute;
  left: 0;
  transform: translateX(-50%);
}

.precision-knob {
  top: 5px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.22);
}

.precision-range:focus-visible .precision-knob,
.precision-range.is-dragging .precision-knob {
  box-shadow:
    0 0 0 3px rgba(var(--ion-color-secondary-rgb), 0.22),
    0 2px 6px rgb(0 0 0 / 0.22);
}

.precision-bubble {
  z-index: 2;
  bottom: 25px;
  width: 3rem;
  padding: 0.2rem 0;
  border-radius: 0.45rem;
  color: #fff;
  background: var(--ion-color-secondary);
  box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
  font-size: 10px;
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
  pointer-events: none;
}

.precision-range.is-fine .precision-knob {
  box-shadow:
    0 0 0 4px rgba(var(--ion-color-secondary-rgb), 0.3),
    0 2px 6px rgb(0 0 0 / 0.22);
}

:global(html.precision-range-dragging .draw-menu ion-range) {
  pointer-events: none !important;
}
</style>
