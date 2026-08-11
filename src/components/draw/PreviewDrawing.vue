<template>
  <div class="flex flex-col items-center justify-center w-full">
    <div
      class="relative cursor-pointer flex items-center justify-center rounded-2xl shadow-lg overflow-hidden"
      :style="{
        aspectRatio: newAspectRatio || props.aspectRatio || 1,
        width: `min(11rem, calc(11rem * ${newAspectRatio || props.aspectRatio || 1}))`,
      }"
      @click="openModal"
    >
      <ion-skeleton-text
        v-if="!isLoaded"
        :animated="true"
        class="absolute inset-0 z-20 w-full h-full m-0"
      />
<img
        width="1"
        height="1"
        loading="lazy"
        decoding="async"
        v-show="props.src || newPreview"
		:src="newPreview || props.src || undefined"
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
      :class="isLoaded ? 'opacity-100' : 'opacity-0 pointer-events-none'"
    >
      <ion-icon slot="end" :icon="svg(mdiCrop)" class="ml-2 w-6 h-6" />
      Crop Image
    </ion-button>
  </div>

  <ion-modal
    :is-open="isOpen"
    @did-present="initCropper"
    @did-dismiss="handleModalDismiss"
  >
    <div class="w-full h-full flex flex-col safe-area bg-black">
      <ion-toolbar color="black">
        <ion-button slot="end" fill="clear" class="font-bold text-white" @click="crop">
          Crop
        </ion-button>
        <ion-button slot="end" fill="clear" class="text-white" @click="closeModal">
          <ion-icon :icon="svg(mdiClose)" class="w-6 h-6" />
        </ion-button>
      </ion-toolbar>

      <ion-content>
        <div class="w-full h-full bg-black flex items-center justify-center">
          <div
            class="crop-stage"
            :class="{ 'is-ready': isCropperReady, 'is-settling': isSettling }"
          >
<img
              width="1"
              height="1"
              loading="lazy"
              decoding="async"
              ref="imageRef"
				:src="props.src || undefined"
              class="block max-w-full"
              crossorigin="anonymous"
            />
          </div>
        </div>
      </ion-content>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import {
	IonButton,
	IonContent,
	IonIcon,
	IonModal,
	IonSkeletonText,
	IonToolbar,
} from "@ionic/vue";
import { mdiClose, mdiCrop } from "@mdi/js";
import "cropperjs/dist/cropper.css";
import { svg } from "@/helper/general.helper";
import { useDrawingCropper } from "./useDrawingCropper";

const props = withDefaults(
	defineProps<{
		src?: string | null;
		newPreview?: string | null;
		aspectRatio: number;
	}>(),
	{ src: null, newPreview: null, aspectRatio: 1 },
);
const emit =
	defineEmits<
		(
			event: "crop-completed",
			boundary: { x: number; y: number; width: number; height: number },
		) => void
	>();
const {
	isOpen,
	imageRef,
	isCropperReady,
	isLoaded,
	newAspectRatio,
	isSettling,
	openModal,
	closeModal,
	initCropper,
	handleModalDismiss,
	crop,
} = useDrawingCropper(
	() => props.src,
	(boundary) => emit("crop-completed", boundary),
);
</script>

<style scoped>
ion-modal {
  --height: 100%;
  --width: 100%;
}

.crop-stage {
  max-width: 90%;
  max-height: 80%;
  opacity: 0;
  transform: scale(0.96);
  transition: opacity 260ms ease-out, transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.crop-stage.is-ready {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .crop-stage { transition: none; transform: none; }
}
</style>

<style>
.cropper-view-box {
  outline: 3px solid var(--ion-color-secondary) !important;
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.5);
}

.cropper-dashed,
.cropper-center,
.cropper-line,
.point-e,
.point-n,
.point-w,
.point-s {
  display: none !important;
}

.cropper-point {
  width: 100px !important;
  height: 100px !important;
  opacity: 1 !important;
  background: transparent !important;
  transition: opacity 140ms ease-out;
}

.is-settling .cropper-point { opacity: 0 !important; }
.point-nw { border-left: 10px solid var(--ion-color-secondary) !important; border-top: 10px solid var(--ion-color-secondary) !important; left: -6px !important; top: -6px !important; }
.point-ne { border-right: 10px solid var(--ion-color-secondary) !important; border-top: 10px solid var(--ion-color-secondary) !important; right: -6px !important; top: -6px !important; }
.point-sw { border-left: 10px solid var(--ion-color-secondary) !important; border-bottom: 10px solid var(--ion-color-secondary) !important; left: -6px !important; bottom: -6px !important; }
.point-se { border-right: 10px solid var(--ion-color-secondary) !important; border-bottom: 10px solid var(--ion-color-secondary) !important; right: -8px !important; bottom: -8px !important; width: 70px !important; height: 70px !important; }
.cropper-modal { opacity: 0.7 !important; background: #000 !important; }

@media (prefers-reduced-motion: reduce) {
  .cropper-point { transition: none; }
  .is-settling .cropper-point { opacity: 1 !important; }
}
</style>
