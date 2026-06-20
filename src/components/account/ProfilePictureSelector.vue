<template>
  <div class="relative w-32 h-32 group/avatar mx-auto">
    <div
      @click="() => imgInput!.click()"
      class="cursor-pointer w-full h-full rounded-[2.5rem] bg-primary/40 backdrop-blur-xl border-2 shadow-lg overflow-hidden transition-all duration-300 z-20 relative flex items-center justify-center group-hover/avatar:scale-105 group-hover/avatar:shadow-primary/20 group-hover/avatar:shadow-2xl"
      :style="{ borderColor: customization?.borderColor || 'rgba(0,0,0,0.1)' }"
    >
      <img
        alt="Profile picture"
        :src="img"
        class="object-cover w-full h-full transition-transform duration-500 group-hover/avatar:scale-110"
      />
    </div>

    <input
      type="file"
      ref="imgInput"
      class="hidden"
      accept="image/png, image/jpeg, image/webp, image/gif"
      @change="onImageChange"
    />

    <div class="absolute -bottom-1 -right-1 w-10 h-10 bg-primary/80 backdrop-blur-md border border-primary/60 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-300 z-40 group-hover/avatar:translate-x-1 group-hover/avatar:translate-y-1 pointer-events-none">
      <ion-icon :icon="svg(mdiCameraPlus)" class="text-xl text-black" />
    </div>

    <button
      v-if="!img.includes('stock')"
      class="absolute cursor-pointer -top-1 -right-1 w-8 h-8 bg-black/10 backdrop-blur-md border border-black/5 rounded-xl shadow-sm flex items-center justify-center hover:bg-red-500/20 active:scale-90 transition-all duration-300 z-50 group/delete group-hover/avatar:-translate-x-1 group-hover/avatar:-translate-y-1"
      @click.stop="confirmDelete"
    >
      <ion-icon :icon="svg(mdiClose)" class="text-lg text-black/60 group-hover/delete:text-red-600 transition-colors" />
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
import { mdiCameraPlus, mdiClose } from "@mdi/js";
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
button.z-50:hover ~ .rounded-\[2\.5rem\] { background-color: transparent !important; }
</style>