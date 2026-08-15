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
	type ReferenceViewportTransform,
	transformReferencePlacement,
} from "@/draw/references/referenceViewport";
import { useDrawStore } from "@/draw/session/draw.store";
import { forwardInstrumentWheel } from "@/draw/tools/instruments/instrumentWheel";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";

type GestureKind = "move" | "resize";

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

function viewportSize() {
	const rect = overlayEl.value?.getBoundingClientRect();
	return {
		width: Math.max(1, rect?.width ?? globalThis.innerWidth ?? 1),
		height: Math.max(1, rect?.height ?? globalThis.innerHeight ?? 1),
	};
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function startGesture(
	kind: GestureKind,
	reference: DrawingReference,
	event: PointerEvent,
) {
	event.preventDefault();
	event.stopPropagation();
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
	};
	(event.currentTarget as Element).setPointerCapture(event.pointerId);
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

	const reference = referencesStore.references.find(
		(item) => item.id === gesture.id,
	);
	if (!reference) return;
	const viewport = viewportSize();
	const dx = event.clientX - gesture.startClientX;
	const dy = event.clientY - gesture.startClientY;

	if (gesture.kind === "move") {
		const height = reference.collapsed
			? 38
			: reference.width / reference.aspectRatio + 38;
		referencesStore.updatePlacement(reference.id, {
			x: clamp(
				gesture.startX + dx,
				12,
				Math.max(12, viewport.width - reference.width - 12),
			),
			y: clamp(
				gesture.startY + dy,
				12,
				Math.max(12, viewport.height - height - 12),
			),
		});
		return;
	}

	const requested = Math.max(
		gesture.startWidth + dx,
		gesture.startWidth + dy * gesture.aspectRatio,
	);
	const maxWidth = Math.max(
		120,
		Math.min(
			560,
			viewport.width - reference.x - 12,
			(viewport.height - reference.y - 50) * gesture.aspectRatio,
		),
	);
	referencesStore.updatePlacement(reference.id, {
		width: clamp(requested, Math.min(120, maxWidth), maxWidth),
	});
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

	for (const reference of referencesStore.references) {
		referencesStore.updatePlacement(
			reference.id,
			transformReferencePlacement(reference, previousViewport, nextViewport),
		);
	}
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
	resizeObserver = new ResizeObserver(() =>
		referencesStore.clampToViewport(viewportSize()),
	);
	resizeObserver.observe(overlayEl.value);
	referencesStore.clampToViewport(viewportSize());
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
