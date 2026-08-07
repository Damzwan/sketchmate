<template>
  <div class="flex flex-col items-center justify-center w-full">
    <div
      class="relative cursor-pointer flex items-center justify-center rounded-2xl shadow-lg overflow-hidden"
      :style="{
    aspectRatio: newAspectRatio || props.aspectRatio || 1,
    width: `min(11rem, calc(11rem * ${newAspectRatio || props.aspectRatio || 1}))`
  }"
      @click="openModal"
    >
      <div v-if="!isLoaded" class="absolute inset-0 z-20">
        <ion-skeleton-text :animated="true" class="w-full h-full m-0" />
      </div>

      <img
        v-show="props.src || newPreview"
        :src="newPreview || props.src"
        @load="isLoaded = true"
        class="absolute inset-0 w-full h-full object-cover block transition-opacity duration-500"
        :class="isLoaded ? 'opacity-100' : 'opacity-0'"
        alt="Canvas Preview"
      />
    </div>


    <ion-button
      fill="clear"
      size="large"
      color="secondary"
      @click="openModal"
      :class="isLoaded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'"
    >
      <IonIcon slot="end" :icon="svg(mdiCrop)" class="ml-2 w-6 h-6" />
      Crop Image
    </ion-button>
  </div>

  <ion-modal :is-open="isOpen" @didPresent="initCropper" @didDismiss="handleModalDismiss">
    <div class="w-full h-full flex flex-col safe-area bg-black">
      <ion-toolbar class="bg-black" color="black">
        <ion-button
          slot="end"
          fill="clear"
          class="font-bold text-white"
          @click="crop"
        >
          Crop
        </ion-button>

        <ion-button
          slot="end"
          fill="clear"
          class="text-white text-lg"
          @click="closeModal"
        >
          <IonIcon :icon="svg(mdiClose)" class="w-6 h-6" />
        </ion-button>
      </ion-toolbar>

      <ion-content>
        <div class="w-full h-full bg-black flex items-center justify-center relative">
          <div
            class="crop-stage"
            :class="[isCropperReady ? 'is-ready' : '', isSettling ? 'is-settling' : '']"
            style="max-width: 90%; max-height: 80%;"
          >
            <img
              ref="imageRef"
              :src="props.src"
              class="block max-w-full"
              crossorigin="anonymous"
            />
          </div>
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup>
import {
	IonButton,
	IonContent,
	IonIcon,
	IonModal,
	IonSkeletonText,
	IonToolbar,
	modalController,
} from "@ionic/vue";
import Cropper from "cropperjs";
import { onBeforeUnmount, ref, watch } from "vue";
import "cropperjs/dist/cropper.css";

import { mdiClose, mdiCrop, mdiFullscreen } from "@mdi/js";
import { IS_LOW_END_DEVICE } from "@/draw/config/renderQuality.config";
import { svg } from "@/helper/general.helper.ts";

const props = defineProps({
	src: {
		type: String,
		required: false,
		default: null,
	},
	newPreview: {
		type: String,
		required: false,
		default: null,
	},
	aspectRatio: {
		type: Number,
		required: true,
		default: 1,
	},
});

const emit = defineEmits(["crop-completed"]);

const isOpen = ref(false);
const imageRef = ref(null);
const isCropperReady = ref(false); // Tracks when Cropper is fully initialized
let cropperInstance = null;
const isLoaded = ref(false);

const newAspectRatio = ref();

const openModal = () => (isOpen.value = true);

watch(
	() => [props.src],
	() => {
		if (!props.src) newAspectRatio.value = undefined;
		isLoaded.value = false;
	},
);

const closeModal = () => {
	isOpen.value = false;
};

const initCropper = () => {
	shouldCrop = false;
	if (imageRef.value) {
		// Reset readiness state just in case
		isCropperReady.value = false;

		cropperInstance = new Cropper(imageRef.value, {
			viewMode: 1, // Restricts crop box to within the canvas
			dragMode: "move", // Allows moving the image instead of creating new crop boxes
			autoCropArea: 1,
			zoomable: true,
			scalable: true,
			background: false,
			// The rule-of-thirds guides are 1px #eee borders drawn straight across the
			// image, and the centre indicator a white cross — on a drawing they read
			// as white seams cutting through the artwork, not as UI.
			guides: false,
			center: false,
			responsive: true,
			restore: false, // Prevents it from resetting oddly on window resize

			ready() {
				cacheCropperElements();
				isCropperReady.value = true;
			},

			cropstart() {
				// A new grip owns the geometry from here: drop any settle still in
				// flight (the element snaps to the state cropper is already reasoning
				// about, which is where it was heading anyway) and forget the previous
				// gesture's area sample. Seeded HIGH, not 0: the first frame of a grab
				// has nothing to compare against, and 0 would read as "expanding" and
				// could fire a zoom-out on a box the user is actually shrinking.
				endSettle();
				previousBoxArea = Number.POSITIVE_INFINITY;
			},

			cropmove(event) {
				syncImageToCrop(event);
			},

			cropend() {
				autoZoomToSelection();
			},
		});
	}
};

// ── Settle animation ────────────────────────────────────────────────────────
//
// Releasing a handle re-frames the selection, and that used to be one instant
// jump. It is now a FLIP: the new state is still applied SYNCHRONOUSLY, so
// cropper stays the single source of truth and the numbers a later crop reads
// are never mid-tween — then the canvas and crop box are transformed back to
// where they just were and released.
//
// Why not tween cropper's own data over rAF: setCanvasData writes CSS
// width/height on both the wrapper and the <img>, so every frame would re-lay
// out and force the WebView to re-raster a 2000px bitmap at a new size. A
// transform is composited, costs no layout, and reuses the existing texture —
// which is what makes this survivable on a cheap Android WebView. The tradeoff
// is that the image is a scaled texture for the length of the flight; at these
// ratios and durations it is not perceptible, and it is sharp again the moment
// the transform is dropped.
const SETTLE_MS = IS_LOW_END_DEVICE ? 220 : 320;
const SETTLE_EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";

const isSettling = ref(false);
let canvasEl = null;
let cropBoxEl = null;
let settleTimer = null;

function cacheCropperElements() {
	const root = imageRef.value?.parentElement;
	canvasEl = root?.querySelector(".cropper-canvas") ?? null;
	cropBoxEl = root?.querySelector(".cropper-crop-box") ?? null;
}

function prefersReducedMotion() {
	return (
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
	);
}

/** Drop the transition and leave the element on its committed transform. */
function endSettle() {
	if (settleTimer) {
		clearTimeout(settleTimer);
		settleTimer = null;
	}
	for (const el of [canvasEl, cropBoxEl]) {
		if (!el) continue;
		el.style.transition = "";
		el.style.willChange = "";
		el.style.transformOrigin = "";
	}
	isSettling.value = false;
}

/**
 * `before`/`after` are cropper's own canvas rects, read either side of the
 * commit. The crop box takes the SAME transform on purpose: the selection is a
 * fixed region of the image, so its screen rect maps through the identical
 * similarity — one matrix keeps the box glued to the pixels it selects for the
 * whole flight.
 */
function playSettle(before, after) {
	if (!canvasEl || !cropBoxEl || !after.width || prefersReducedMotion()) return;

	const scale = before.width / after.width;
	const dx = before.left - after.left * scale;
	const dy = before.top - after.top * scale;

	// Nothing moved far enough to be worth promoting two layers for.
	if (Math.abs(scale - 1) < 0.002 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
		return;
	}

	// Cropper positions both elements with a transform of its own; the inverse
	// has to compose with it, not replace it, so it is captured and kept as the
	// tail of the list (and as the exact value to land on).
	const targets = [
		{ el: canvasEl, committed: canvasEl.style.transform },
		{ el: cropBoxEl, committed: cropBoxEl.style.transform },
	];

	isSettling.value = true;
	for (const { el, committed } of targets) {
		el.style.transformOrigin = "0 0";
		el.style.willChange = "transform";
		el.style.transition = "none";
		el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale}) ${committed}`;
	}

	// Deliberate single reflow: without reading layout here the browser coalesces
	// the inverted transform and the committed one into no change at all.
	void canvasEl.offsetWidth;

	for (const { el, committed } of targets) {
		el.style.transition = `transform ${SETTLE_MS}ms ${SETTLE_EASING}`;
		el.style.transform = committed;
	}

	// A timer rather than `transitionend`: it also covers the case where the
	// WebView drops the transition entirely under load.
	settleTimer = setTimeout(endSettle, SETTLE_MS + 60);
}

const autoZoomToSelection = () => {
	if (!cropperInstance) return;

	// A queued drag frame would fire against post-commit geometry and undo the
	// re-frame we are about to animate.
	cancelSync();
	endSettle();

	// 1. Save the exact area of the image currently selected (natural pixels)
	const cropData = cropperInstance.getData();
	const containerData = cropperInstance.getContainerData();
	const before = cropperInstance.getCanvasData();

	// 2. Calculate the zoom ratio to make this selection fill 80% of the screen
	const scaleX = (containerData.width * 0.8) / cropData.width;
	const scaleY = (containerData.height * 0.8) / cropData.height;
	const newZoomRatio = Math.min(scaleX, scaleY);

	// 3. Zoom the image canvas to that exact ratio
	cropperInstance.zoomTo(newZoomRatio);

	// 4. Calculate where to move the canvas so our selection is perfectly centered
	const containerCenterX = containerData.width / 2;
	const containerCenterY = containerData.height / 2;

	// Convert natural image coordinates to our new scaled canvas coordinates
	const canvasCenterX = (cropData.x + cropData.width / 2) * newZoomRatio;
	const canvasCenterY = (cropData.y + cropData.height / 2) * newZoomRatio;

	// 5. Move the canvas so the selection is in the middle of the screen
	cropperInstance.moveTo(
		containerCenterX - canvasCenterX,
		containerCenterY - canvasCenterY,
	);

	// 6. Force the crop box to clamp back down onto the exact same objects we saved in Step 1
	cropperInstance.setData(cropData);

	// 7. Read back what cropper ACTUALLY landed on — viewMode 1 clamps — so the
	//    animation ends on the real state and cannot pop at the last frame.
	playSettle(before, cropperInstance.getCanvasData());
};

function teardownCropper() {
	endSettle();
	cancelSync();
	canvasEl = null;
	cropBoxEl = null;
	if (cropperInstance) {
		cropperInstance.destroy();
		cropperInstance = null;
	}
	isCropperReady.value = false;
}

const handleModalDismiss = () => {
	isOpen.value = false;

	// We do this here to prevent lagg since the crop operation is heavvy!
	if (cropperInstance && shouldCrop) {
		const cropData = cropperInstance.getData(true);
		const imageData = cropperInstance.getImageData();

		const relativeBoundary = {
			x: cropData.x / imageData.naturalWidth,
			y: cropData.y / imageData.naturalHeight,
			width: cropData.width / imageData.naturalWidth,
			height: cropData.height / imageData.naturalHeight,
		};

		isLoaded.value =
			relativeBoundary.x === 0 &&
			relativeBoundary.y === 0 &&
			relativeBoundary.width === 1 &&
			relativeBoundary.height === 1;
		newAspectRatio.value = cropData.width / cropData.height;

		teardownCropper();

		emit("crop-completed", relativeBoundary);
		return;
	}

	// Dismissing WITHOUT cropping has to tear down too. `Cropper.init()` bails on
	// an element that already carries an instance, so a surviving one made every
	// later open a no-op: no `ready()`, no crop UI, just the faded-out stage.
	teardownCropper();
};

onBeforeUnmount(teardownCropper);

let shouldCrop = false;

function crop() {
	modalController.dismiss();
	shouldCrop = true;
}

// Define this outside your function/event listener so it persists
let previousBoxArea = 0;

// `cropmove` fires once per pointermove — up to 120Hz on an Android panel, and
// every one of them used to run a zoom or a pan through cropper, each of which
// re-styles the wrapper and the <img>. The work is now coalesced onto one frame,
// so the cost is bounded by the refresh rate instead of by the touch rate, and
// the elastic pan advances once per PAINTED frame (it was already rAF-gated, so
// the feel is unchanged — just no longer paying for the events it dropped).
let syncFrame = 0;
let pendingAction = null;

function cancelSync() {
	if (syncFrame) cancelAnimationFrame(syncFrame);
	syncFrame = 0;
	pendingAction = null;
}

const syncImageToCrop = (event) => {
	pendingAction = event.detail.action;
	if (syncFrame) return;
	syncFrame = requestAnimationFrame(runSync);
};

function runSync() {
	syncFrame = 0;
	const action = pendingAction;
	pendingAction = null;
	if (!cropperInstance || !action) return;

	const container = cropperInstance.getContainerData();
	const box = cropperInstance.getCropBoxData();

	// 1. GENTLE ZOOM OUT (When box gets too big for the screen)
	// If the user is expanding the box and it hits 90% of the screen,
	// we zoom the image OUT so they can see more context.
	if (action !== "all") {
		const coverage = Math.max(
			box.width / container.width,
			box.height / container.height,
		);

		// Calculate current area to determine if we are expanding or shrinking
		const currentBoxArea = box.width * box.height;
		const isExpanding = currentBoxArea > previousBoxArea;

		// Update the previous area for the next frame
		previousBoxArea = currentBoxArea;

		// ONLY zoom out if coverage is high AND the user is making the box bigger
		if (coverage > 0.85 && isExpanding) {
			// Calculate the new zoom ratio (zooming out by 1%)
			const canvasData = cropperInstance.getCanvasData();
			const imageData = cropperInstance.getImageData();
			const currentRatio = canvasData.width / imageData.naturalWidth;
			const newRatio = currentRatio * 0.99;

			// Find the stationary anchor point (pivot) based on the drag handle
			let pivotX = box.left + box.width / 2; // Default to center
			let pivotY = box.top + box.height / 2;

			// Anchor the OPPOSITE side of the active handle so the image stays pinned
			if (action === "se") {
				pivotX = box.left;
				pivotY = box.top;
			} else if (action === "sw") {
				pivotX = box.left + box.width;
				pivotY = box.top;
			} else if (action === "ne") {
				pivotX = box.left;
				pivotY = box.top + box.height;
			} else if (action === "nw") {
				pivotX = box.left + box.width;
				pivotY = box.top + box.height;
			} else if (action === "e") {
				pivotX = box.left;
			} else if (action === "w") {
				pivotX = box.left + box.width;
			} else if (action === "s") {
				pivotY = box.top;
			} else if (action === "n") {
				pivotY = box.top + box.height;
			}

			// Zoom specifically to that anchored pivot point
			cropperInstance.zoomTo(newRatio, { x: pivotX, y: pivotY });
		}
		return;
	}

	// 2. REFINED DAMPENED PANNING (The "Elastic" feel)
	// Reduced threshold to 10% so it feels like a true boundary
	const threshold = 0.05;
	const edgeLeft = container.width * threshold;
	const edgeTop = container.height * threshold;
	const edgeRight = container.width * (1 - threshold);
	const edgeBottom = container.height * (1 - threshold);

	let moveX = 0;
	let moveY = 0;

	// Calculate how far "into" the edge we are
	if (box.left < edgeLeft) moveX = edgeLeft - box.left;
	if (box.top < edgeTop) moveY = edgeTop - box.top;
	if (box.left + box.width > edgeRight)
		moveX = edgeRight - (box.left + box.width);
	if (box.top + box.height > edgeBottom)
		moveY = edgeBottom - (box.top + box.height);

	if (moveX !== 0 || moveY !== 0) {
		// LOWER multiplier: 0.05 at 60fps is too fast. 0.015 gives a tighter, heavier feel.
		const speedMultiplier = 0.1;

		// SPEED LIMIT: Cap the movement to a maximum of 3 pixels per frame.
		// This prevents the "runaway" sliding effect if the user moves the mouse aggressively.
		const maxSpeed = 10;

		const deltaX = Math.max(
			-maxSpeed,
			Math.min(maxSpeed, moveX * speedMultiplier),
		);
		const deltaY = Math.max(
			-maxSpeed,
			Math.min(maxSpeed, moveY * speedMultiplier),
		);

		// Strictly event-driven, deliberately: `move()` shifts the CANVAS while the
		// crop box stays put in container space, so the "past the edge" test that
		// got us here never clears by itself. A self-scheduling frame would drift
		// forever after the finger lifts.
		cropperInstance.move(deltaX, deltaY);
	}
}
</script>

<style scoped>
ion-modal {
  --height: 100%;
  --width: 100%;
}

/* Opacity + transform only, so the entrance is composited and never asks the
   WebView to lay out or re-raster the preview bitmap. */
.crop-stage {
  opacity: 0;
  transform: scale(0.96);
  transition: opacity 260ms ease-out, transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.crop-stage.is-ready {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .crop-stage {
    transition: none;
    transform: none;
  }
}
</style>

<style>
/* 1. Use Secondary Color for the Selection Outline */
.cropper-view-box {
  /* Increased thickness of the main box outline */
  outline: 3px solid var(--ion-color-secondary) !important;
}

/* 2. Hide all the non-corner elements.
   .cropper-dashed / .cropper-center belong here too: the `guides: false` and
   `center: false` options above already drop them, this keeps them gone if an
   instance is ever built without those options. */
.cropper-dashed,
.cropper-center,
.cropper-line,
.point-e,
.point-n,
.point-w,
.point-s {
  display: none !important;
}

/* 3. Massive Touch Targets for Corners */
.cropper-point {
  width: 100px !important; /* Huge invisible area for better mobile UX */
  height: 100px !important;
  opacity: 1 !important;
  background-color: transparent !important;
  transition: opacity 140ms ease-out;
}

/* 3b. The settle scales the crop box, brackets included — a 10px border briefly
   becoming 14px and snapping back is exactly the jitter the animation exists to
   remove. Fading them for the flight hides it, and reads as the selection
   "letting go" and re-arming. Opacity only: still one composited layer. */
.is-settling .cropper-point {
  opacity: 0 !important;
}

@media (prefers-reduced-motion: reduce) {
  .cropper-point {
    transition: none;
  }

  .is-settling .cropper-point {
    opacity: 1 !important;
  }
}

/* 4. Extra-Bold "L" Brackets */
/* Using 10px borders for high visibility */
.point-nw, .point-ne, .point-sw, .point-se {
}

.point-nw {
  border-left: 10px solid var(--ion-color-secondary) !important;
  border-top: 10px solid var(--ion-color-secondary) !important;
  left: -6px !important;
  top: -6px !important;
}

.point-ne {
  border-right: 10px solid var(--ion-color-secondary) !important;
  border-top: 10px solid var(--ion-color-secondary) !important;
  right: -6px !important;
  top: -6px !important;
}

.point-sw {
  border-left: 10px solid var(--ion-color-secondary) !important;
  border-bottom: 10px solid var(--ion-color-secondary) !important;
  left: -6px !important;
  bottom: -6px !important;
}

.point-se {
  border-right: 10px solid var(--ion-color-secondary) !important;
  border-bottom: 10px solid var(--ion-color-secondary) !important;
  right: -8px !important;
  bottom: -8px !important;
  /* Visual cue: slightly larger than other corners */
  width: 70px !important;
  height: 70px !important;
}

/* 5. Darken the outside area heavily */
.cropper-modal {
  opacity: 0.7 !important;
  background-color: #000 !important;
}

/* 6. Optional: Add a subtle glow to the selection so it pops on dark photos */
.cropper-view-box {
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
}
</style>