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
        <div class="flex justify-between items-center px-2 mb-1 text-[10px] font-black uppercase tracking-widest">
          <span class="text-black/40">Artist Name</span>
          <span v-if="isNameChangeLocked" class="text-secondary flex items-center gap-1">
            <ion-icon :icon="svg(mdiClockOutline)" />
            Wait {{ daysRemaining }} Days
          </span>
          <span v-else class="text-secondary">
            <ion-icon :icon="svg(mdiAlertCircleOutline)" v-if="hasNameChanged" />
            {{ isPro ? 'Pro' : 'Changes locked for 31 days' }}
          </span>
        </div>
        <ion-input
          type="text"
          :counter="true"
          v-model="localName"
          placeholder="Artist Name"
          :minlength="4"
          :maxlength="40"
          :disabled="isNameChangeLocked"
          class="w-full text-center text-xl font-black text-black bg-white/70 border-2 border-white rounded-[1.5rem] px-4 mr-2"
        />
      </div>

      <div class="w-full">
        <span class="px-2 mb-1 block text-[10px] font-black uppercase tracking-widest text-black/40">Bio</span>
        <ion-textarea
          v-model="localDesc"
          placeholder="Add a short bio or description..."
          :counter="true"
          maxlength="80"
          :auto-grow="true"
          rows="3"
          class="font-bold text-black italic text-base bg-white/70 border-2 border-white rounded-[1.5rem] px-4"
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
import dayjs from 'dayjs'
import { IonButton, IonIcon, IonInput, IonTextarea } from '@ionic/vue'
import { mdiAlertCircleOutline, mdiClockOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { useSubscriptionStore } from '@/store/subscription.store'
import ProfilePictureSelector from '@/components/account/ProfilePictureSelector.vue'
import BaseSheetModal from '@/components/general/BaseSheetModal.vue' // Adjust path as necessary
import {
  NAME_CHANGE_COOLDOWN_DAYS,
  type Customization
} from '@/config/profile_options.config'
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
const subStore = useSubscriptionStore()

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

// Cooldown Logic
const isPro = computed(() => subStore.isPro)
const daysRemaining = computed(() => {
  if (!props.user?.last_name_change) return 0
  const diff =
    NAME_CHANGE_COOLDOWN_DAYS -
    dayjs().diff(dayjs(props.user.last_name_change), 'day')
  return diff > 0 ? diff : 0
})
const isNameChangeLocked = computed(
  () => !isPro.value && daysRemaining.value > 0
)
const hasNameChanged = computed(
  () => localName.value.trim() !== props.user?.name
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