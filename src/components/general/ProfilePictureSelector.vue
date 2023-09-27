<template>
  <ion-avatar class="w-32 h-32 relative cursor-pointer">
    <img alt="Profile picture" :src="img" class="object-fill w-full h-full" @click="() => imgInput!.click()" />
    <input type="file" ref="imgInput" class="hidden" accept="image/*" @change="onImageChange" />
    <ion-icon :icon="addOutline" class="add-icon rounded-full" @click="() => imgInput!.click()" />
    <ion-icon
      v-if="img != stock_img"
      :icon="svg(mdiClose)"
      class="absolute z-50 -right-5 -top-2 w-[30px] h-[30px] fill-gray-400 cursor-pointer"
      @click="deleteProfileImage"
    />
  </ion-avatar>

  <ion-modal :isOpen="cropperMenuOpen" @willDismiss="closeCropper" @didPresent="initCropper">
    <CircularLoader v-if="cropperLoading" class="bg-black absolute z-10 w-full h-full" />
    <div class="flex flex-col h-full">
      <div class="flex-grow flex items-center">
        <img :src="localImgUrl" ref="imgRef" alt="cropper image" class="hidden" />
      </div>

      <div class="h-10 flex justify-between items-center">
        <ion-button fill="clear" size="small" class="text-white" @click="closeCropper">Cancel</ion-button>
        <ion-button fill="clear" size="small" class="text-white" @click="apply">Apply</ion-button>
      </div>
    </div>
  </ion-modal>
</template>

<script lang="ts" setup>
import { addOutline } from 'ionicons/icons'
import { IonAvatar, IonButton, IonIcon, IonModal } from '@ionic/vue'
import { ref } from 'vue'
import CircularLoader from '@/components/loaders/CircularLoader.vue'
import { compressImg, setAppColors, svg } from '@/helper/general.helper'
import { photoSwiperColorConfig, settingsModalColorConfig } from '@/config/colors.config'
import 'cropperjs/dist/cropper.min.css'
import Cropper from 'cropperjs'
import { mdiClose } from '@mdi/js'
import { stock_img } from '@/config/general.config'
import { useAPI } from '@/service/api/api.service'
import { useAppStore } from '@/store/app.store'
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

defineProps<{
  img: string
}>()

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
      }
    }

    reader.readAsDataURL(target.files[0])
  }
}

function initCropper() {
  setAppColors(photoSwiperColorConfig)
  imgRef.value?.addEventListener('ready', () => (cropperLoading.value = false))
  cropper = new Cropper(imgRef.value!, {
    aspectRatio: 1,
    background: false,
    viewMode: 2
  })
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

function deleteProfileImage() {
  const { user } = storeToRefs(useAppStore())
  const { toast } = useToast()

  Preferences.set({ key: LocalStorage.img, value: stock_img })
  deleteProfileImg({ _id: user.value!._id })

  user.value!.img = stock_img
  toast('Deleted profile image')
}
</script>

<style scoped>
.add-icon {
  background: var(--ion-color-secondary);
  position: absolute;
  right: 12px;
  bottom: 10px;
  z-index: 4;
}

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
