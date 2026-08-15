<template>
  <ion-popover :keepContentsMounted="true" :showBackdrop="false" ref="t" :is-open="moreToolsMenuOpen" :event="menuEvent"
               @didDismiss="moreToolsMenuOpen = false">
    <ion-content>
      <ion-list lines="none" class="divide-y divide-primary p-0">
        <ion-item color="tertiary" :button="true" :detail="true" id="background-color">
          <ion-icon :icon="svg(mdiPaletteOutline)" />
          <p class="pl-2 text-base">Background Color</p>

          <ion-popover trigger="background-color" side="left" alignment="end">
            <ColorPicker :color="backgroundColor" @update:color="onCanvasBackgroundChange" :show-opacity="true" />
          </ion-popover>
        </ion-item>

        <ion-item
          color="tertiary"
          :button="true"
          id="stickers"
          :detail="true"
          :disabled="true"
        >
          <ion-icon :icon="svg(mdiStickerEmoji)" />
          <p class="pl-2 text-base">Stickers</p>
          <p class="pl-2 text-sm">coming soon</p>
        </ion-item>


        <ion-item color="tertiary" :button="true" @click="onImgClick" :detail="true">
          <input type="file" class="hidden" ref="imgInput" @change="onImgUpload" accept="image/*" />
          <ion-icon :icon="svg(mdiImage)" />
          <p class="pl-2 text-base">Image</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="onCameraClick" :detail="true">
          <ion-icon :icon="svg(mdiCamera)" />
          <p class="pl-2 text-base">Camera</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="openReferenceMenu" :detail="true">
          <ion-icon :icon="svg(mdiImageSearchOutline)" />
          <p class="pl-2 text-base">References</p>
          <p v-if="referenceCount" class="pl-2 text-sm opacity-60">{{ referenceCount }}</p>
        </ion-item>

        <ion-item color="tertiary" :button="true" @click="onTextClick" :detail="true">
          <ion-icon :icon="svg(mdiFormatText)" />
          <p class="pl-2 text-base">Text</p>
        </ion-item>

        <!--        <ion-item color="tertiary" :button="true" :detail="true" @click="openShapesMenu">-->
        <!--          <ion-icon :icon="svg(mdiShapeOutline)" />-->
        <!--          <p class="pl-2 text-base">Shapes</p>-->
        <!--        </ion-item>-->

        <ion-item color="tertiary" :button="true" :detail="true" @click="openSavedMenu" :disabled="!user">
          <ion-icon :icon="svg(mdiContentSave)" />
          <p class="pl-2 text-base">Saved Drawings</p>
        </ion-item>

        <!-- Lobby-only: claim a private region others can't edit -->
        <ion-item v-if="inLobby" color="tertiary" :button="true" @click="onClaimArea">
          <ion-icon :icon="svg(mdiSelectionDrag)" />
          <p class="pl-2 text-base">My Area</p>
          <p class="pl-2 text-sm opacity-60">{{ myAreaCount }}/2</p>
        </ion-item>

        <ion-item v-if="inLobby && myAreaCount > 0" color="tertiary" :button="true" @click="onReleaseAreas">
          <ion-icon :icon="svg(mdiSelectionRemove)" />
          <p class="pl-2 text-base">Release My Area{{ myAreaCount > 1 ? 's' : '' }}</p>
        </ion-item>
      </ion-list>
      <ion-action-sheet
        id="action-sheet"
        class="my-custom-class"
        color="background"
        mode="ios"
        :is-open="imageActionSheetOpen"
        @didDismiss="imageActionSheetOpen = false"
        :buttons="imageActionSheetButtons"
      />
    </ion-content>
    <ImageCropper :img-url="compressedImgDataUrl" />
  </ion-popover>
</template>

<script lang="ts" setup>
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import {
	ActionSheetButton,
	IonActionSheet,
	IonContent,
	IonIcon,
	IonItem,
	IonList,
	IonPopover,
	popoverController,
} from "@ionic/vue";
import {
	mdiCamera,
	mdiContentSave,
	mdiDraw,
	mdiFormatText,
	mdiImage,
	mdiImagePlusOutline,
	mdiImageSearchOutline,
	mdiPaletteOutline,
	mdiSelectionDrag,
	mdiSelectionRemove,
	mdiStickerEmoji,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
import ColorPicker from "@/components/draw/ColorPicker.vue";
import ImageCropper from "@/components/draw/ImageCropper.vue";
import { DrawAction } from "@/draw/actions/drawAction.types";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { createSketchFromDataURL } from "@/draw/document/export";
import { useDrawingReferenceStore } from "@/draw/references/reference.store";
import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { svg } from "@/helper/general.helper";
import { compressImg } from "@/helper/image.helper";
import { ensurePwaElements } from "@/helper/pwaElements.helper";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";

const claimArea = useClaimArea();
const { roomId } = storeToRefs(useDrawSyncer());
const inLobby = computed(() => !!roomId.value);
const myAreaCount = computed(() => claimArea.myAreas.length);
const referenceCount = computed(
	() => useDrawingReferenceStore().references.length,
);

function onClaimArea() {
	closePopover();
	claimArea.enterClaimMode();
}

function onReleaseAreas() {
	claimArea.releaseMine();
	closePopover();
}

const imgInput = ref<HTMLInputElement>();
const compressedImgDataUrl = ref<string | undefined>();
const imageActionSheetOpen = ref(false);
const { selectAction } = useDrawStore();
const { user } = storeToRefs(useAuthStore());
const { openMenu } = useMenuStore();
const { backgroundColor } = storeToRefs(useDrawStore());

const {
	shapesMenuOpen,
	stickersEmblemsSavedSelectedTab,
	moreToolsMenuOpen,
	menuEvent,
} = storeToRefs(useMenuStore());
const t = ref<any>();

watch(shapesMenuOpen, () => {
	if (!shapesMenuOpen.value) {
		t.value.$el.dismiss();
	}
});

function openSavedMenu() {
	openMenu(Menu.StickerEmblemSaved);
	stickersEmblemsSavedSelectedTab.value = "saved";
	closePopover();
}

function openReferenceMenu() {
	openMenu(Menu.Reference);
	closePopover();
}

// TODO move this
const imageActionSheetButtons: ActionSheetButton[] = [
	{
		text: "Add image to canvas",
		role: "selected",
		icon: svg(mdiImagePlusOutline),
		handler: addImage,
	},
	{
		text: "Create sketch from image",
		role: "selected",
		icon: svg(mdiDraw),
		handler: createSketchFromImage,
	},
	// TODO this does not really work anymore with a big canvas
	// {
	//   text: 'Use image as background',
	//   icon: svg(mdiPanoramaVariantOutline),
	//   role: 'selected',
	//   handler: () => openMenu(Menu.Cropper)
	// },
	{
		text: "Cancel",
		role: "cancel",
		data: {
			action: "cancel",
		},
	},
];

function closePopover() {
	return popoverController.dismiss();
}

function addImage() {
	if (!compressedImgDataUrl.value) return;
	selectAction(DrawAction.AddImage, { imageUrl: compressedImgDataUrl.value });
}

async function createSketchFromImage() {
	selectAction(DrawAction.AddImage, {
		imageUrl: await createSketchFromDataURL(compressedImgDataUrl.value!),
	});
}

function onTextClick() {
	selectAction(DrawAction.AddText, undefined);
	closePopover();
}

function onCanvasBackgroundChange(color: string) {
	selectAction(DrawAction.SetCanvasBackground, { color });
}

async function onImgClick() {
	imgInput.value?.click();
}

async function onCameraClick() {
	await closePopover(); // weird location but it does not work otherwise haha
	await ensurePwaElements();

	const image = await Camera.getPhoto({
		quality: 100,
		resultType: CameraResultType.Uri,
		source: CameraSource.Camera,
		allowEditing: false,
	});

	const blob = await fetch(image.webPath!).then((res) => res.blob());
	const compressedFile = await compressImg(blob, { size: 500 }); // TODO maybe too big
	const reader = new FileReader();
	reader.onload = (e) =>
		(compressedImgDataUrl.value = e.target?.result?.toString());

	reader.readAsDataURL(compressedFile);
	imageActionSheetOpen.value = true;
}

async function onImgUpload(e: any) {
	closePopover(); // TODO weird location but it does not work otherwise haha
	const file = e.target.files?.[0];
	e.target.value = "";
	imageActionSheetOpen.value = true;
	if (file) {
		const compressedFile = await compressImg(file, { size: 500 }); // TODO maybe too big
		const reader = new FileReader();
		reader.onload = (e) =>
			(compressedImgDataUrl.value = e.target?.result?.toString());
		reader.readAsDataURL(compressedFile);
	}
}
</script>

<style scoped>
ion-action-sheet.my-custom-class {
  --background: var(--ion-color-primary);
  --button-background-selected: var(--ion-color-primary);
  --button-color: var(--ion-color-dark);
}

ion-action-sheet.my-custom-class .action-sheet-cancel {
  color: var(--ion-color-secondary); /* Custom color for cancel button text */
}

ion-action-sheet.my-custom-class .action-sheet-cancel {
  --background: #e97223;
}

ion-list {
  padding: 0;
}
</style>
