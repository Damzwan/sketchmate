<template>
  <div class="relative w-32 h-32 group/avatar mx-auto">
    <!-- Round avatar -->
    <div
      @click="() => imgInput!.click()"
      class="cursor-pointer w-full h-full rounded-full bg-primary/40 border-4 shadow-md overflow-hidden transition-transform duration-300 relative flex items-center justify-center active:scale-95 md:group-hover/avatar:scale-105"
      :style="{ borderColor: customization?.borderColor || 'var(--ion-color-tertiary)' }"
    >
      <img
        alt="Profile picture"
        :src="img"
        class="object-cover w-full h-full transition-transform duration-500 md:group-hover/avatar:scale-110"
      />
    </div>

    <input
      type="file"
      ref="imgInput"
      class="hidden"
      accept="image/png, image/jpeg, image/webp, image/gif"
      @change="onImageChange"
    />

    <!-- Change badge — sits on the ring, clearly says "tap to change" -->
    <button
      @click="() => imgInput!.click()"
      class="absolute bottom-0 right-0 w-10 h-10 bg-secondary rounded-full shadow-md border-2 border-white flex items-center justify-center active:scale-90 transition-transform z-40"
      aria-label="Change picture"
    >
      <ion-icon :icon="svg(mdiCamera)" class="text-xl text-white" />
    </button>

    <!-- Remove — high-contrast, fully inside the box so it never clips -->
    <button
      v-if="!img.includes('stock')"
      class="absolute top-0 right-0 w-8 h-8 bg-white rounded-full shadow-md border border-black/10 flex items-center justify-center active:scale-90 hover:bg-red-500 transition-colors z-50 group/delete"
      @click.stop="confirmDelete"
      aria-label="Remove picture"
    >
      <ion-icon :icon="svg(mdiClose)" class="text-lg text-red-500 group-hover/delete:text-white transition-colors" />
    </button>
  </div>

  <ion-modal :isOpen="cropperMenuOpen" @willDismiss="closeCropper" @didPresent="initCropper">
    <CircularLoader v-if="cropperLoading" class="bg-black absolute z-10 w-full h-full" />
    <div class="flex flex-col h-full safe-area">
      <div class="grow flex items-center">
        <img :src="localImgUrl" ref="imgRef" alt="cropper image" class="hidden" />
      </div>
      <div class="h-10 flex justify-between items-center px-4">
        <ion-button fill="clear" size="default" class="text-white" @click="closeCropper">Cancel</ion-button>
        <ion-button fill="clear" size="default" class="text-white" @click="apply">Apply</ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script lang="ts" setup>
import { alertController, IonButton, IonIcon, IonModal } from "@ionic/vue";
import { ref } from "vue";
import CircularLoader from "@/components/general/loaders/CircularLoader.vue";
import { compressImg, getRandomStockAvatar, setAppColors, svg } from "@/helper/general.helper";
import { photoSwiperColorConfig, settingsModalColorConfig } from "@/config/colors.config";
import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import { mdiCamera, mdiClose } from "@mdi/js";
import { useAuthStore } from "@/store/auth.store";
import { useSubscriptionStore } from "@/store/subscription.store"; // Adjust path if needed
import { storeToRefs } from "pinia";
import { useToast } from "@/service/toast.service";
import { Preferences } from "@capacitor/preferences";
import { LocalStorage } from "@/types/storage.types";
import { deleteProfileImg } from "@/service/api/user.api";
import { useMenuStore } from '@/store/menu.store'
import { Menu } from '@/draw/types/draw.types'

defineProps<{
  img: string;
  customization?: any;
}>();

const emits = defineEmits(["update:img", "upload", "openPaywall"]);

let cropper: Cropper;
const cropperMenuOpen = ref(false);
const cropperLoading = ref(true);
const imgInput = ref<HTMLInputElement>();
const localImgUrl = ref();
const imgRef = ref<HTMLImageElement>();

const subscriptionStore = useSubscriptionStore();

const showProAlert = async () => {
  const alert = await alertController.create({
    header: "Premium Feature",
    message: "Animated GIF avatars are exclusive to Pro members. Upgrade to customize your profile!",
    cssClass: "liquid-alert",
    buttons: [
      { text: "Maybe Later", role: "cancel", cssClass: "alert-button-cancel" },
      {
        text: "Get pro",
        cssClass: "alert-button-confirm",
        handler: () => {
          const {openMenu} = useMenuStore()
          openMenu(Menu.Shop)
        }
      },
    ],
  });
  await alert.present();
};

const onImageChange = async (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (!target.files || !target.files[0]) return;

  const file = target.files[0];

  // Check if it's a GIF
  if (file.type === "image/gif") {
    // Intercept if they aren't Pro
    if (!subscriptionStore.isPro) {
      if (imgInput.value) imgInput.value.value = "";
      await showProAlert();
      return;
    }

    // Process valid Pro GIF upload
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        emits("update:img", event.target.result as string);
        emits("upload", event.target.result as string, "image/gif");
      }
    };
    reader.readAsDataURL(file);
    if (imgInput.value) imgInput.value.value = "";
    return;
  }

  // Handle standard images (JPEG, PNG, WEBP)
  const reader = new FileReader();
  reader.onload = async (event) => {
    if (event.target?.result) {
      const compressedImg = await compressImg(event.target.result as string, {
        size: 1024,
        returnType: "blob",
      });
      localImgUrl.value = URL.createObjectURL(compressedImg);
      cropperMenuOpen.value = true;
      if (imgInput.value) imgInput.value.value = "";
    }
  };
  reader.readAsDataURL(file);
};

function initCropper() {
  setAppColors(photoSwiperColorConfig);
  imgRef.value?.addEventListener("ready", () => (cropperLoading.value = false));
  if (cropper) cropper.destroy();
  cropper = new Cropper(imgRef.value!, {
    aspectRatio: 1,
    background: false,
    viewMode: 2,
  });
}

function closeCropper() {
  cropperMenuOpen.value = false;
  cropperLoading.value = true;
  setAppColors(settingsModalColorConfig);
  if (cropper) cropper.destroy();
}

function apply() {
  const imgUrl = cropper.getCroppedCanvas().toDataURL("image/webp");
  closeCropper();
  emits("update:img", imgUrl);
  emits("upload", imgUrl, "image/webp");
}

const confirmDelete = async () => {
  const alert = await alertController.create({
    header: "Remove Image?",
    message: "Are you sure you want to revert to a stock avatar?",
    cssClass: "liquid-alert",
    buttons: [
      { text: "Keep it", role: "cancel", cssClass: "alert-button-cancel" },
      { text: "Remove", role: "destructive", cssClass: "alert-button-confirm", handler: () => deleteProfileImage() },
    ],
  });
  await alert.present();
};

function deleteProfileImage() {
  const { user } = storeToRefs(useAuthStore());
  const { toast } = useToast();
  const stock_img = getRandomStockAvatar();
  Preferences.set({ key: LocalStorage.img, value: stock_img });
  deleteProfileImg({ _id: user.value!._id, stock_img });
  user.value!.img = stock_img;
  toast("Profile image removed");
}
</script>

<style scoped>
@reference "@/theme/main.css";
ion-modal { --background: #000000; --height: 100%; --width: 100%; }
</style>