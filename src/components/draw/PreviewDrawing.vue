<template>
  <div class="flex flex-col items-center justify-center w-full">
    <div
      class="relative flex items-center justify-center rounded-2xl shadow-lg overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.02] cursor-pointer"
      :style="{
        aspectRatio: newAspectRatio || props.aspectRatio,
        width: `min(11rem, calc(11rem * ${newAspectRatio || props.aspectRatio}))`
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
      class="mt-4 font-semibold transition-opacity duration-500"
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
            class="transition-opacity duration-300"
            :class="isCropperReady ? 'opacity-100' : 'opacity-0'"
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
import { ref, watch } from 'vue'
import { IonButton, IonContent, IonIcon, IonModal, IonSkeletonText, IonToolbar, modalController } from '@ionic/vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'

import { mdiClose, mdiCrop, mdiFullscreen } from '@mdi/js'
import { svg } from '@/helper/general.helper.ts'

const props = defineProps({
  src: {
    type: String,
    required: false,
    default: null
  },
  newPreview: {
    type: String,
    required: false,
    default: null
  }, aspectRatio: {
    type: Number,
    required: true,
    default: 1
  }
})

const emit = defineEmits(['crop-completed'])

const isOpen = ref(false)
const imageRef = ref(null)
const isCropperReady = ref(false) // Tracks when Cropper is fully initialized
let cropperInstance = null
const isLoaded = ref(false)

const newAspectRatio = ref()

const openModal = () => (isOpen.value = true)

watch(
  () => [props.src],
  ([]) => {
    if (!props.src) newAspectRatio.value = undefined
    isLoaded.value = false
  }
)

const closeModal = () => {
  isOpen.value = false
}

const initCropper = () => {
  shouldCrop = false
  if (imageRef.value) {
    // Reset readiness state just in case
    isCropperReady.value = false

    cropperInstance = new Cropper(imageRef.value, {
      viewMode: 1,      // Restricts crop box to within the canvas
      dragMode: 'move', // Allows moving the image instead of creating new crop boxes
      autoCropArea: 1,
      zoomable: true,
      scalable: true,
      background: false,
      responsive: true,
      restore: false,   // Prevents it from resetting oddly on window resize

      ready() {
        isCropperReady.value = true
      },

      cropmove(event) {
        syncImageToCrop(event)
      },

      cropend(event) {
        autoZoomToSelection()
      }
    })
  }
}

const autoZoomToSelection = () => {
  if (!cropperInstance) return

  // 1. Save the exact area of the image currently selected (natural pixels)
  const cropData = cropperInstance.getData()
  const containerData = cropperInstance.getContainerData()

  // 2. Calculate the zoom ratio to make this selection fill 80% of the screen
  const scaleX = (containerData.width * 0.8) / cropData.width
  const scaleY = (containerData.height * 0.8) / cropData.height
  const newZoomRatio = Math.min(scaleX, scaleY)

  // 3. Zoom the image canvas to that exact ratio
  cropperInstance.zoomTo(newZoomRatio)

  // 4. Calculate where to move the canvas so our selection is perfectly centered
  const containerCenterX = containerData.width / 2
  const containerCenterY = containerData.height / 2

  // Convert natural image coordinates to our new scaled canvas coordinates
  const canvasCenterX = (cropData.x + cropData.width / 2) * newZoomRatio
  const canvasCenterY = (cropData.y + cropData.height / 2) * newZoomRatio

  // 5. Move the canvas so the selection is in the middle of the screen
  cropperInstance.moveTo(
    containerCenterX - canvasCenterX,
    containerCenterY - canvasCenterY
  )

  // 6. Force the crop box to clamp back down onto the exact same objects we saved in Step 1
  cropperInstance.setData(cropData)
}

const handleModalDismiss = () => {
  isOpen.value = false

  // We do this here to prevent lagg since the crop operation is heavvy!
  if (cropperInstance && shouldCrop) {
    const cropData = cropperInstance.getData(true)
    const imageData = cropperInstance.getImageData()

    const relativeBoundary = {
      x: cropData.x / imageData.naturalWidth,
      y: cropData.y / imageData.naturalHeight,
      width: cropData.width / imageData.naturalWidth,
      height: cropData.height / imageData.naturalHeight
    }

    isLoaded.value = relativeBoundary.x === 0 && relativeBoundary.y === 0 && relativeBoundary.width === 1 && relativeBoundary.height === 1
    newAspectRatio.value = cropData.width / cropData.height


    cropperInstance.destroy()
    cropperInstance = null
    isCropperReady.value = false

    emit('crop-completed', relativeBoundary)
  }
}

let shouldCrop = false

function crop() {
  modalController.dismiss()
  shouldCrop = true
}

// Add these to your script setup to track velocity/state
let isProcessingSync = false

// Define this outside your function/event listener so it persists
let previousBoxArea = 0
const syncImageToCrop = (event) => {
  if (!cropperInstance || isProcessingSync) return

  const container = cropperInstance.getContainerData()
  const canvas = cropperInstance.getCanvasData()
  const box = cropperInstance.getCropBoxData()
  const action = event.detail.originalEvent.type // check if touch or mouse

  // 1. GENTLE ZOOM OUT (When box gets too big for the screen)
  // If the user is expanding the box and it hits 90% of the screen,
  // we zoom the image OUT so they can see more context.
// 1. GENTLE ZOOM OUT (When box gets too big for the screen)
  if (event.detail.action !== 'all') {
    const coverage = Math.max(box.width / container.width, box.height / container.height)

    // Calculate current area to determine if we are expanding or shrinking
    const currentBoxArea = box.width * box.height
    const isExpanding = currentBoxArea > previousBoxArea

    // Update the previous area for the next frame
    previousBoxArea = currentBoxArea

    // ONLY zoom out if coverage is high AND the user is making the box bigger
    if (coverage > 0.85 && isExpanding) {
      // Calculate the new zoom ratio (zooming out by 1%)
      const canvasData = cropperInstance.getCanvasData()
      const imageData = cropperInstance.getImageData()
      const currentRatio = canvasData.width / imageData.naturalWidth
      const newRatio = currentRatio * 0.99

      // Find the stationary anchor point (pivot) based on the drag handle
      const action = event.detail.action
      let pivotX = box.left + box.width / 2  // Default to center
      let pivotY = box.top + box.height / 2

      // Anchor the OPPOSITE side of the active handle so the image stays pinned
      if (action === 'se') {
        pivotX = box.left
        pivotY = box.top
      } else if (action === 'sw') {
        pivotX = box.left + box.width
        pivotY = box.top
      } else if (action === 'ne') {
        pivotX = box.left
        pivotY = box.top + box.height
      } else if (action === 'nw') {
        pivotX = box.left + box.width
        pivotY = box.top + box.height
      } else if (action === 'e') {
        pivotX = box.left
      } else if (action === 'w') {
        pivotX = box.left + box.width
      } else if (action === 's') {
        pivotY = box.top
      } else if (action === 'n') {
        pivotY = box.top + box.height
      }

      // Zoom specifically to that anchored pivot point
      cropperInstance.zoomTo(newRatio, { x: pivotX, y: pivotY })
    }
    return
  }

// 2. REFINED DAMPENED PANNING (The "Elastic" feel)
  // Reduced threshold to 10% so it feels like a true boundary
  const threshold = 0.05
  const edgeLeft = container.width * threshold
  const edgeTop = container.height * threshold
  const edgeRight = container.width * (1 - threshold)
  const edgeBottom = container.height * (1 - threshold)

  let moveX = 0
  let moveY = 0

  // Calculate how far "into" the edge we are
  if (box.left < edgeLeft) moveX = edgeLeft - box.left
  if (box.top < edgeTop) moveY = edgeTop - box.top
  if (box.left + box.width > edgeRight) moveX = edgeRight - (box.left + box.width)
  if (box.top + box.height > edgeBottom) moveY = edgeBottom - (box.top + box.height)

  if (moveX !== 0 || moveY !== 0) {
    isProcessingSync = true

    // LOWER multiplier: 0.05 at 60fps is too fast. 0.015 gives a tighter, heavier feel.
    const speedMultiplier = 0.100

    // SPEED LIMIT: Cap the movement to a maximum of 3 pixels per frame.
    // This prevents the "runaway" sliding effect if the user moves the mouse aggressively.
    const maxSpeed = 10

    const deltaX = Math.max(-maxSpeed, Math.min(maxSpeed, moveX * speedMultiplier))
    const deltaY = Math.max(-maxSpeed, Math.min(maxSpeed, moveY * speedMultiplier))

    cropperInstance.move(deltaX, deltaY)

    requestAnimationFrame(() => {
      isProcessingSync = false
    })
  }
}
</script>

<style scoped>
ion-modal {
  --height: 100%;
  --width: 100%;
}

</style>

<style>
/* 1. Use Secondary Color for the Selection Outline */
.cropper-view-box {
  /* Increased thickness of the main box outline */
  outline: 3px solid var(--ion-color-secondary) !important;
}

/* 2. Hide all the non-corner elements */
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
  opacity: 0.9 !important;
  background-color: #000 !important;
}

/* 6. Optional: Add a subtle glow to the selection so it pops on dark photos */
.cropper-view-box {
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
}
</style>