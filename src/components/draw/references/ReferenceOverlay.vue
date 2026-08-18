<template>
  <div ref="overlayEl" class="reference-overlay" aria-live="polite">
    <article
      v-for="reference in visibleReferences"
      :key="reference.id"
      class="reference-card"
      :class="{ 'is-collapsed': reference.collapsed }"
      :style="cardStyle(reference)"
      @wheel="forwardWheel"
    >
      <div
        class="reference-header"
        :aria-label="`Move ${reference.name}`"
        @pointerdown="startGesture('move', reference, $event)"
        @pointermove="updateGesture"
        @pointerup="endGesture"
        @pointercancel="endGesture"
      >
        <ion-icon :icon="svg(mdiDragHorizontalVariant)" aria-hidden="true" />
        <span class="reference-name">{{ reference.name }}</span>
        <span v-if="reference.shared" class="shared-dot" title="Shared with room" />
        <button
          type="button"
          class="reference-header-button"
          aria-label="Open reference settings"
          @pointerdown.stop
          @click.stop="openReferenceSheet"
        >
          <ion-icon :icon="svg(mdiTuneVariant)" />
        </button>
        <button
          type="button"
          class="reference-header-button"
          :aria-label="reference.collapsed ? 'Expand reference' : 'Collapse reference'"
          @pointerdown.stop
          @click.stop="toggleCollapsed(reference)"
        >
          <ion-icon :icon="svg(reference.collapsed ? mdiChevronDown : mdiChevronUp)" />
        </button>
        <button
          type="button"
          class="reference-header-button"
          aria-label="Hide reference"
          @pointerdown.stop
          @click.stop="closeReference(reference)"
        >
          <ion-icon :icon="svg(mdiEyeOffOutline)" />
        </button>
      </div>

      <div v-if="!reference.collapsed" class="reference-image-wrap">
        <img
          :src="reference.dataUrl"
          :alt="reference.name"
          class="reference-image"
          :style="imageStyle(reference)"
          draggable="false"
          decoding="async"
        />
        <button
          type="button"
          class="reference-resize-handle"
          :aria-label="`Resize ${reference.name}`"
          @pointerdown="startGesture('resize', reference, $event)"
          @pointermove="updateGesture"
          @pointerup="endGesture"
          @pointercancel="endGesture"
        >
          <ion-icon :icon="svg(mdiResizeBottomRight)" />
        </button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import {
	mdiChevronDown,
	mdiChevronUp,
	mdiDragHorizontalVariant,
	mdiEyeOffOutline,
	mdiResizeBottomRight,
	mdiTuneVariant,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { DrawingReference } from "@/draw/references/reference.store";
import { useDrawingReferenceStore } from "@/draw/references/reference.store";
import {
	overlayResized,
	type ReferenceOverlaySize,
	type ReferenceViewportTransform,
	transformReferencePlacement,
} from "@/draw/references/referenceViewport";
import { useDrawStore } from "@/draw/session/draw.store";
import { forwardInstrumentWheel } from "@/draw/tools/instruments/instrumentWheel";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";

type GestureKind = "move" | "resize";

/** Matches MIN_CLAMP_VIEWPORT in reference.store. */
const MIN_VIEWPORT = 160;

interface ActiveGesture {
	kind: GestureKind;
	id: string;
	pointerId: number;
	startClientX: number;
	startClientY: number;
	startX: number;
	startY: number;
	startWidth: number;
	aspectRatio: number;
	collapsed: boolean;
	/**
	 * The card being dragged, written to DIRECTLY for the duration of the
	 * gesture. Routing every frame through the store replaced the reference array
	 * (shallowRef → new array → every card re-renders and every transform is
	 * recomputed) sixty times a second to move ONE card — the kind of per-frame
	 * cost a cheap Android phone pays for in dropped frames. The store gets the
	 * final placement on pointerup, which is the only value anything else reads.
	 */
	element: HTMLElement | null;
	/** Frozen at gesture start: a rect read per frame is a forced layout. */
	viewport: { width: number; height: number };
	latest: { x: number; y: number; width: number };
}

const referencesStore = useDrawingReferenceStore();
const { visibleReferences } = storeToRefs(referencesStore);
const drawStore = useDrawStore();
const { isCanvasInitialized } = storeToRefs(drawStore);
const menuStore = useMenuStore();
const overlayEl = ref<HTMLElement>();
let activeGesture: ActiveGesture | null = null;
let resizeObserver: ResizeObserver | null = null;
let pendingFrame: number | null = null;
let pendingEvent: PointerEvent | null = null;
let attachedCanvas: ReturnType<typeof drawStore.getCanvas> | null = null;
let previousViewport: ReferenceViewportTransform | null = null;
let clampedViewport: ReferenceOverlaySize | null = null;

function cardStyle(reference: DrawingReference) {
	return {
		width: `${reference.width}px`,
		transform: `translate3d(${reference.x}px, ${reference.y}px, 0)`,
	};
}

function imageStyle(reference: DrawingReference) {
	return {
		aspectRatio: String(reference.aspectRatio),
		opacity: String(reference.opacity),
		transform: reference.flipped ? "scaleX(-1)" : undefined,
	};
}

/**
 * Null while the overlay has no real box. Ionic hides the draw page rather than
 * unmounting it when SendHub is pushed over it, which fires the ResizeObserver
 * with a 0x0 rect — clamping to that would move and shrink every reference.
 */
function viewportSize() {
	const rect = overlayEl.value?.getBoundingClientRect();
	if (!rect || rect.width < MIN_VIEWPORT || rect.height < MIN_VIEWPORT) {
		return null;
	}
	return { width: rect.width, height: rect.height };
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function clampToOverlay() {
	const viewport = viewportSize();
	if (!viewport) return;
	if (!overlayResized(clampedViewport, viewport)) return;
	clampedViewport = viewport;
	referencesStore.clampToViewport(viewport);
}

function startGesture(
	kind: GestureKind,
	reference: DrawingReference,
	event: PointerEvent,
) {
	event.preventDefault();
	event.stopPropagation();
	const target = event.currentTarget as HTMLElement;
	activeGesture = {
		kind,
		id: reference.id,
		pointerId: event.pointerId,
		startClientX: event.clientX,
		startClientY: event.clientY,
		startX: reference.x,
		startY: reference.y,
		startWidth: reference.width,
		aspectRatio: reference.aspectRatio,
		collapsed: reference.collapsed,
		element: target.closest(".reference-card"),
		viewport: viewportSize() ?? { width: MIN_VIEWPORT, height: MIN_VIEWPORT },
		latest: { x: reference.x, y: reference.y, width: reference.width },
	};
	target.setPointerCapture(event.pointerId);
}

function updateGesture(event: PointerEvent) {
	if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;
	event.preventDefault();
	event.stopPropagation();
	pendingEvent = event;
	if (pendingFrame !== null) return;
	pendingFrame = requestAnimationFrame(commitGesture);
}

function commitGesture() {
	pendingFrame = null;
	const event = pendingEvent;
	pendingEvent = null;
	const gesture = activeGesture;
	if (!event || !gesture) return;

	const viewport = gesture.viewport;
	const dx = event.clientX - gesture.startClientX;
	const dy = event.clientY - gesture.startClientY;

	if (gesture.kind === "move") {
		const height = gesture.collapsed
			? 38
			: gesture.latest.width / gesture.aspectRatio + 38;
		gesture.latest.x = clamp(
			gesture.startX + dx,
			12,
			Math.max(12, viewport.width - gesture.latest.width - 12),
		);
		gesture.latest.y = clamp(
			gesture.startY + dy,
			12,
			Math.max(12, viewport.height - height - 12),
		);
	} else {
		const requested = Math.max(
			gesture.startWidth + dx,
			gesture.startWidth + dy * gesture.aspectRatio,
		);
		const maxWidth = Math.max(
			120,
			Math.min(
				560,
				viewport.width - gesture.latest.x - 12,
				(viewport.height - gesture.latest.y - 50) * gesture.aspectRatio,
			),
		);
		gesture.latest.width = clamp(requested, Math.min(120, maxWidth), maxWidth);
	}

	// Straight to the element: no store write, no re-render, no layout read.
	const element = gesture.element;
	if (!element) return;
	element.style.transform = `translate3d(${gesture.latest.x}px, ${gesture.latest.y}px, 0)`;
	if (gesture.kind === "resize") {
		element.style.width = `${gesture.latest.width}px`;
	}
}

function endGesture(event: PointerEvent) {
	if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;
	event.preventDefault();
	event.stopPropagation();
	if (pendingFrame !== null) {
		cancelAnimationFrame(pendingFrame);
		pendingFrame = null;
		pendingEvent = event;
		commitGesture();
	}
	try {
		(event.currentTarget as Element).releasePointerCapture(event.pointerId);
	} catch {
		// The browser may release capture first when the card is collapsed.
	}
	// The single store write for the whole gesture. Everything else read the
	// element's inline style, which the re-render below now agrees with.
	referencesStore.updatePlacement(activeGesture.id, {
		...activeGesture.latest,
	});
	activeGesture = null;
}

function toggleCollapsed(reference: DrawingReference) {
	referencesStore.updateAppearance(reference.id, {
		collapsed: !reference.collapsed,
	});
}

function closeReference(reference: DrawingReference) {
	referencesStore.updateAppearance(reference.id, { hidden: true });
}

function openReferenceSheet() {
	if (!menuStore.referenceMenuOpen) menuStore.openMenu(Menu.Reference);
}

function currentViewportTransform(): ReferenceViewportTransform | null {
	const transform = attachedCanvas?.viewportTransform;
	if (!transform || transform.length < 6) return null;
	return [
		transform[0],
		transform[1],
		transform[2],
		transform[3],
		transform[4],
		transform[5],
	];
}

function sameViewport(
	first: ReferenceViewportTransform,
	second: ReferenceViewportTransform,
) {
	return first.every((value, index) => value === second[index]);
}

function followCanvasViewport() {
	const nextViewport = currentViewportTransform();
	if (!nextViewport) return;
	if (!previousViewport) {
		previousViewport = nextViewport;
		return;
	}
	if (sameViewport(previousViewport, nextViewport)) return;
	// The common case is a canvas with no references at all, and this runs on
	// every frame of every pan and zoom.
	if (referencesStore.references.length === 0) {
		previousViewport = nextViewport;
		return;
	}

	// One store write for the whole set. Per-reference writes rebuilt the array
	// once per reference, on every pan/zoom event.
	const moved = new Map<
		string,
		ReturnType<typeof transformReferencePlacement>
	>();
	for (const reference of referencesStore.references) {
		moved.set(
			reference.id,
			transformReferencePlacement(reference, previousViewport, nextViewport),
		);
	}
	referencesStore.updatePlacements(moved);
	previousViewport = nextViewport;
}

function attachCanvas() {
	detachCanvas();
	if (!isCanvasInitialized.value) return;
	attachedCanvas = drawStore.getCanvas();
	previousViewport = currentViewportTransform();
	attachedCanvas.on("viewport:changed", followCanvasViewport);
	attachedCanvas.on("zoomChanged", followCanvasViewport);
	attachedCanvas.on("zoomReset", followCanvasViewport);
	attachedCanvas.on("gestureEnd", followCanvasViewport);
}

function detachCanvas() {
	if (attachedCanvas) {
		attachedCanvas.off("viewport:changed", followCanvasViewport);
		attachedCanvas.off("zoomChanged", followCanvasViewport);
		attachedCanvas.off("zoomReset", followCanvasViewport);
		attachedCanvas.off("gestureEnd", followCanvasViewport);
	}
	attachedCanvas = null;
	previousViewport = null;
}

function forwardWheel(event: WheelEvent) {
	if (!attachedCanvas) return;
	forwardInstrumentWheel(event, attachedCanvas.upperCanvasEl);
}

watch(isCanvasInitialized, attachCanvas, { immediate: true });

onMounted(() => {
	if (!overlayEl.value) return;
	resizeObserver = new ResizeObserver(clampToOverlay);
	resizeObserver.observe(overlayEl.value);
	clampToOverlay();
});

onBeforeUnmount(() => {
	resizeObserver?.disconnect();
	detachCanvas();
	if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
});
</script>

<style scoped>
.reference-overlay {
  position: absolute;
  inset: 0;
  z-index: 7;
  overflow: hidden;
  pointer-events: none;
}

.reference-card {
  position: absolute;
  top: 0;
  left: 0;
  overflow: hidden;
  border: 1px solid rgb(0 0 0 / 20%);
  border-radius: 14px;
  background: transparent;
  box-shadow: 0 10px 28px rgb(0 0 0 / 22%);
  contain: layout paint style;
}

.reference-card.is-collapsed {
  border-radius: 999px;
}

.reference-header {
  height: 38px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 5px 0 10px;
  border-bottom: 1px solid rgb(0 0 0 / 10%);
  color: var(--ion-color-dark);
  background: var(--ion-color-tertiary);
  cursor: grab;
  touch-action: none;
  user-select: none;
  pointer-events: auto;
}

.reference-header:active {
  cursor: grabbing;
}

.reference-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-weight: 800;
}

.shared-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--ion-color-secondary);
  box-shadow: 0 0 0 2px rgb(0 0 0 / 8%);
}

.reference-header-button,
.reference-resize-handle {
  display: grid;
  place-items: center;
  border: 0;
  color: var(--ion-color-dark);
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  touch-action: none;
}

.reference-header-button {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.reference-header-button:hover,
.reference-header-button:active {
  background: rgb(0 0 0 / 8%);
}

.reference-image-wrap {
  position: relative;
  overflow: hidden;
  background: transparent;
  pointer-events: none;
}

.reference-image {
  display: block;
  width: 100%;
  height: auto;
  object-fit: contain;
  transform-origin: center;
  pointer-events: none;
  user-select: none;
}

.reference-resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 38px;
  height: 38px;
  border: 1px solid rgb(0 0 0 / 12%);
  border-radius: 14px 0 0 0;
  background: color-mix(in srgb, var(--ion-color-tertiary) 92%, transparent);
  cursor: nwse-resize;
}

@media (max-width: 640px) {
  .reference-header-button,
  .reference-resize-handle {
    min-width: 34px;
    min-height: 34px;
  }
}
</style>
