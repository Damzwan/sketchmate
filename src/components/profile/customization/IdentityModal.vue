<template>
  <BaseSheetModal
    :is-open="isOpen"
    title="Identity"
    subtitle="Update your public profile"
    @close="handleDismiss"
  >
    <div class="flex flex-col items-center">
      <ProfilePictureSelector
        :img="displayImg"
        :customization="customization"
        @update:img="uploadImage"
        class="mb-6"
      />

      <div class="w-full mb-4">
        <div class="flex justify-between items-center px-2 mb-1.5 text-[11px] font-bold uppercase tracking-widest">
          <span class="text-black/80">Artist Name</span>
        </div>
        <ion-input
          type="text"
          color="secondary"
          :counter="true"
          v-model="localName"
          placeholder="Artist Name"
          :minlength="4"
          :maxlength="40"
          class="w-full text-center text-2xl font-bold text-black bg-tertiary border border-primary/40 rounded-[1.5rem] px-4"
        />
      </div>

      <div class="w-full">
        <span class="px-2 mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-black/80">Bio</span>
        <ion-textarea
          v-model="localDesc"
          color="secondary"
          placeholder="Add a short bio or description..."
          :counter="true"
          :maxlength="80"
          :auto-grow="true"
          :rows="3"
          class="text-black italic text-lg bg-tertiary border border-primary/40 rounded-[1.5rem] px-4"
        />
      </div>
    </div>

    <template #footer>
      <ion-button
        expand="block"
        color="secondary"
        shape="round"
        size="large"
        @click="confirm"
      >
        Apply Identity
      </ion-button>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { IonButton, IonInput, IonTextarea } from '@ionic/vue'
import ProfilePictureSelector from '@/components/account/ProfilePictureSelector.vue'
import BaseSheetModal from '@/components/general/BaseSheetModal.vue'
import type { Customization } from '@/config/profile_options.config'
import { useProfileUpload } from '@/composables/general/useProfileUpload'

const props = defineProps<{
  isOpen: boolean;
  user: any;
  customization: Partial<Customization>;
  initialName: string;
  initialDesc: string;
  previewImg: string | null;
}>()

const emit = defineEmits(['close', 'save'])

const localName = ref(props.initialName)
const localDesc = ref(props.initialDesc)
const localImg = ref<string | null>(null)

const displayImg = computed(
  () => localImg.value ?? props.previewImg ?? props.user.img
)

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      localName.value = props.initialName
      localDesc.value = props.initialDesc
      localImg.value = null
    }
  }
)

const { uploadImage } = useProfileUpload()

const confirm = () => {
  emit('save', {
    name: localName.value.trim(),
    description: localDesc.value.trim(),
    img: localImg.value
  })
}

const handleDismiss = () => emit('close')
</script>

<style scoped>
ion-input {
  --padding-end: 10px;
}
</style>