<template>
  <ion-modal :isOpen="cropperMenuOpen" @willDismiss="close" @didPresent="init">
    <CircularLoader v-if="loading" class="bg-black absolute z-10 w-full h-full" />
    <div class="flex flex-col h-full">
      <div class="flex-grow flex items-center">
<img width="1" height="1" loading="eager" decoding="async" :src="imgUrl" ref="imgRef" alt="cropper image" class="hidden" />
      </div>

      <div class="h-10 flex justify-between items-center">
        <ion-button fill="clear" size="small" class="text-white" @click="close">Cancel</ion-button>
        <ion-button fill="clear" size="small" class="text-white" @click="apply">Apply</ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script lang="ts" setup>
import { IonButton, IonModal } from "@ionic/vue";
// import 'cropperjs/dist/cropper.min.css'
import Cropper from "cropperjs";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import CircularLoader from "@/components/general/loaders/CircularLoader.vue";
import {
	photoSwiperColorConfig,
	routeColorConfig,
} from "@/config/colors.config";
import { useDrawStore } from "@/draw/session/draw.store";
import { setAppColors } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

const { cropperMenuOpen } = storeToRefs(useMenuStore());
const { getCanvas } = useDrawStore();

let cropper: Cropper | undefined;
const imgRef = ref<HTMLImageElement>();
const loading = ref(true);
const handleCropperReady = () => {
	loading.value = false;
};

function destroyCropper() {
	imgRef.value?.removeEventListener("ready", handleCropperReady);
	cropper?.destroy();
	cropper = undefined;
}

defineProps<{
	imgUrl: string | undefined;
}>();

function close() {
	cropperMenuOpen.value = false;
	loading.value = true;
	setAppColors(routeColorConfig(FRONTEND_ROUTES.draw));
	destroyCropper();
}

function init() {
	setAppColors(photoSwiperColorConfig);
	destroyCropper();
	imgRef.value?.addEventListener("ready", handleCropperReady, { once: true });
	cropper = new Cropper(imgRef.value!, {
		aspectRatio: getCanvas().width! / getCanvas().height!,
		background: false,
		viewMode: 2,
	});
}

function apply() {
	// NOTE: this only closes the modal — the crop is computed and thrown away.
	// The dispatch below was commented out and the cropped data URL was left
	// assigned to an unused local, so "Apply" has been a no-op. Restoring it
	// needs the AddBackgroundImage action re-checked against the tile renderer,
	// which is a draw-engine change, not a cleanup.
	//   selectAction(DrawAction.AddBackgroundImage, { img: cropper.getCroppedCanvas().toDataURL() })
	close();
}
</script>

<style scoped>
ion-modal {
  --background: #000000;
  --height: 100%;
  --width: 100%;
}
</style>

<style>
.cropper-view-box {
  outline-color: var(--ion-color-primary);
  outline: 1px solid var(--ion-color-primary);
}

.point-se {
  background: var(--ion-color-primary);
}

.point-sw {
  background: var(--ion-color-primary);
}

.point-nw {
  background: var(--ion-color-primary);
}

.point-ne {
  background: var(--ion-color-primary);
}

.point-w {
  background: var(--ion-color-primary);
}

.point-s {
  background: var(--ion-color-primary);
}

.point-n {
  background: var(--ion-color-primary);
}

.point-e {
  background: var(--ion-color-primary);
}

.cropper-line {
  background: var(--ion-color-primary);
}
</style>
