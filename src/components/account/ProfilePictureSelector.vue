<template>
  <div class="relative w-32 h-32 group/avatar">
    <!-- Liquid Glass Avatar Wrapper -->
    <div
      @click="() => imgInput!.click()"
      class="cursor-pointer w-full h-full rounded-[2.5rem] bg-primary/40 backdrop-blur-xl border border-primary/40 shadow-lg overflow-hidden transition-all duration-300 z-20 relative group-hover/avatar:scale-105 group-hover/avatar:shadow-primary/20 group-hover/avatar:shadow-2xl"
    >
      <img
        alt="Profile picture"
        :src="img"
        class="object-cover w-full h-full transition-transform duration-500 group-hover/avatar:scale-110"
      />

    </div>

    <input type="file" ref="imgInput" class="hidden" accept="image/*" @change="onImageChange" />

    <div
      class="absolute -bottom-1 -right-1 w-10 h-10 bg-primary/80 backdrop-blur-md border border-primary/60 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-300 z-40 group-hover/avatar:translate-x-1 group-hover/avatar:translate-y-1 pointer-events-none"
    >
      <ion-icon :icon="svg(mdiCameraPlus)" class="text-xl text-black" />
    </div>

    <!-- Delete Button (Reverted to clean button with specific group) -->
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
import { IonButton, IonIcon, IonModal, alertController } from '@ionic/vue'
import { ref } from 'vue'
import CircularLoader from '@/components/general/loaders/CircularLoader.vue'
import { compressImg, getRandomStockAvatar, setAppColors, svg } from '@/helper/general.helper'
import { photoSwiperColorConfig, settingsModalColorConfig } from '@/config/colors.config'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { mdiClose, mdiCameraPlus } from '@mdi/js'
import { useAPI } from '@/service/api/api.service'
import { useAuthStore } from '@/store/auth.store'
import { storeToRefs } from 'pinia'
import { useToast } from '@/service/toast.service'
import { Preferences } from '@capacitor/preferences'
import { LocalStorage } from '@/types/storage.types'

const { deleteProfileImg } = useAPI()

let cropper: Cropper
const cropperMenuOpen = ref(false)
const cropperLoading = ref(true)

const imgInput = ref<HTMLInputElement>()
const localImgUrl = ref()
const imgRef = ref<HTMLImageElement>()

defineProps<{ img: string }>()
const emits = defineEmits(['update:img'])

const onImageChange = async (e: Event) => {
  const target = e.target as HTMLInputElement
  if (target.files && target.files[0]) {
    const reader = new FileReader()
    reader.onload = async (e: ProgressEvent<FileReader>) => {
      if (e.target) {
        const compressedImg = await compressImg(e.target.result as string, { size: 1024, returnType: 'blob' })
        localImgUrl.value = URL.createObjectURL(compressedImg)
        cropperMenuOpen.value = true
        if (imgInput.value) imgInput.value.value = ''
      }
    }
    reader.readAsDataURL(target.files[0])
  }
}

function initCropper() {
  setAppColors(photoSwiperColorConfig)
  imgRef.value?.addEventListener('ready', () => (cropperLoading.value = false))
  if (cropper) cropper.destroy()
  cropper = new Cropper(imgRef.value!, { aspectRatio: 1, background: false, viewMode: 2 })
}

function closeCropper() {
  cropperMenuOpen.value = false
  cropperLoading.value = true
  setAppColors(settingsModalColorConfig)
  if (cropper) cropper.destroy()
}

function apply() {
  const imgUrl = cropper.getCroppedCanvas().toDataURL()
  closeCropper()
  emits('update:img', imgUrl)
}

const confirmDelete = async () => {
  const alert = await alertController.create({
    header: 'Remove Image?',
    message: 'Are you sure you want to revert to a stock avatar?',
    cssClass: 'liquid-alert',
    buttons: [
      { text: 'Keep it', role: 'cancel', cssClass: 'alert-button-cancel' },
      { text: 'Remove', role: 'destructive', cssClass: 'alert-button-confirm', handler: () => deleteProfileImage() }
    ]
  })
  await alert.present()
}

function deleteProfileImage() {
  const { user } = storeToRefs(useAuthStore())
  const { toast } = useToast()
  const stock_img = getRandomStockAvatar()
  Preferences.set({ key: LocalStorage.img, value: stock_img })
  deleteProfileImg({ _id: user.value!._id, stock_img })
  user.value!.img = stock_img
  toast('Profile image removed')
}
</script>

<style scoped>
@reference "@/theme/main.css";

ion-modal {
  --background: #000000;
  --height: 100%;
  --width: 100%;
}

.avatar-overlay-button::part(native) {
  padding: 0;
  cursor: pointer;
}

/* Ensure the delete button is always on top and blocks parent hover effects if needed */
button.z-50:hover ~ .rounded-\[2\.5rem\] {
  background-color: transparent !important;
}
</style>

<style>
.cropper-view-box { outline-color: var(--ion-color-primary); outline: 1px solid var(--ion-color-primary); }
.point-se, .point-sw, .point-nw, .point-ne, .point-w, .point-s, .point-n, .point-e, .cropper-line { background: var(--ion-color-primary); }
</style>