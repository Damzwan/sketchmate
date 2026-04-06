<template>
  <div class="flex justify-center items-center">
    <div class="relative" v-if="props.src">
      <img
        :src="newPreview ? newPreview : props.src"
        @click="openModal"
        class="max-w-44 max-h-44 object-contain rounded-lg cursor-pointer shadow"
      />

      <button
        @click="openModal"
        class="absolute bottom-1 right-1 bg-black/60 text-white rounded-full p-1 flex items-center justify-center cursor-pointer"
      >
        <IonIcon :icon="svg(mdiFullscreen)" class="w-4 h-4" />
      </button>
    </div>
    <div v-else class="w-44 h-44 rounded-lg shadow">
      <ion-skeleton-text :animated="true" class="w-full h-full" />
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
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { IonButton, IonContent, IonIcon, IonModal, IonSkeletonText, IonToolbar } from '@ionic/vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'

import { mdiClose, mdiFullscreen } from '@mdi/js'
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
  }
})

const emit = defineEmits(['crop-completed'])

const isOpen = ref(false)
const imageRef = ref(null)
const isCropperReady = ref(false) // Tracks when Cropper is fully initialized
let cropperInstance = null

const openModal = () => (isOpen.value = true)

const closeModal = () => {
  isOpen.value = false
}

const initCropper = () => {
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
}

function crop() {
  if (cropperInstance) {
    const cropData = cropperInstance.getData(true)
    const imageData = cropperInstance.getImageData()

    const relativeBoundary = {
      x: cropData.x / imageData.naturalWidth,
      y: cropData.y / imageData.naturalHeight,
      width: cropData.width / imageData.naturalWidth,
      height: cropData.height / imageData.naturalHeight
    }


    cropperInstance.destroy()
    cropperInstance = null
    isCropperReady.value = false


    emit('crop-completed', relativeBoundary)
  }
  handleModalDismiss()
}

// Add these to your script setup to track velocity/state
let isProcessingSync = false

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

    if (coverage > 0.85) {
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
  const threshold = 0.10
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
    const speedMultiplier = 0.015

    // SPEED LIMIT: Cap the movement to a maximum of 3 pixels per frame.
    // This prevents the "runaway" sliding effect if the user moves the mouse aggressively.
    const maxSpeed = 3

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
  outline: 2px solid var(--ion-color-secondary) !important;
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
  width: 40px !important; /* Large area for fingers */
  height: 40px !important;
  opacity: 1 !important;
  background-color: transparent !important;
}

/* 4. Bold "L" Brackets (Thicker borders) */
.point-nw {
  border-left: 6px solid var(--ion-color-secondary) !important;
  border-top: 6px solid var(--ion-color-secondary) !important;
  left: -4px !important;
  top: -4px !important;
}

.point-ne {
  border-right: 6px solid var(--ion-color-secondary) !important;
  border-top: 6px solid var(--ion-color-secondary) !important;
  right: -4px !important;
  top: -4px !important;
}

.point-sw {
  border-left: 6px solid var(--ion-color-secondary) !important;
  border-bottom: 6px solid var(--ion-color-secondary) !important;
  left: -4px !important;
  bottom: -4px !important;
}

.point-se {
  border-right: 6px solid var(--ion-color-secondary) !important;
  border-bottom: 6px solid var(--ion-color-secondary) !important;
  right: -4px !important;
  bottom: -4px !important;
  /* Extra width for the primary drag corner */
  width: 48px !important;
  height: 48px !important;
}

/* 5. Optional: Darken the outside area to make selection pop */
.cropper-modal {
  opacity: 0.8 !important;
  background-color: #000 !important;
}
</style>