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
          :readonly="nameLocked"
          class="w-full text-center text-2xl font-bold text-black bg-tertiary border border-primary/40 rounded-[1.5rem] px-4"
          :class="{ 'opacity-60': nameLocked }"
        />

        <!-- Name-change cooldown notice -->
        <div class="px-2 mt-2 flex items-start gap-1.5 text-[11px] leading-snug">
          <ion-icon
            :icon="nameLocked ? svg(mdiLockClock) : svg(mdiInformationOutline)"
            class="text-sm shrink-0 mt-px"
            :class="nameLocked ? 'text-amber-600' : 'text-black/40'"
          />
          <span v-if="nameLocked" class="font-bold text-amber-700">
            Name locked — you can change it again in
            {{ daysUntilNameChange }} {{ daysUntilNameChange === 1 ? 'day' : 'days' }}.
          </span>
          <span v-else class="text-black/60">
            You can only change your name once every {{ NAME_CHANGE_COOLDOWN_DAYS }} days.
          </span>
        </div>
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
import { IonButton, IonIcon, IonInput, IonTextarea } from '@ionic/vue'
import { mdiInformationOutline, mdiLockClock } from '@mdi/js'
import dayjs from 'dayjs'
import ProfilePictureSelector from '@/components/account/ProfilePictureSelector.vue'
import BaseSheetModal from '@/components/general/BaseSheetModal.vue'
import {
  NAME_CHANGE_COOLDOWN_DAYS,
  type Customization
} from '@/config/profile_options.config'
import { svg } from '@/helper/general.helper'
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

// Name-change cooldown. `last_name_change` is the last time the name was
// updated; a new change is only allowed once the cooldown has elapsed.
const nextNameChangeAt = computed(() => {
  const last = props.user?.last_name_change
  if (!last) return null
  return dayjs(last).add(NAME_CHANGE_COOLDOWN_DAYS, 'day')
})

const daysUntilNameChange = computed(() => {
  if (!nextNameChangeAt.value) return 0
  const hours = nextNameChangeAt.value.diff(dayjs(), 'hour')
  return hours > 0 ? Math.ceil(hours / 24) : 0
})

const nameLocked = computed(() => daysUntilNameChange.value > 0)

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
    // While locked, never submit a changed name (the input is read-only, but
    // guard here too so the cooldown can't be bypassed).
    name: (nameLocked.value ? props.initialName : localName.value).trim(),
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