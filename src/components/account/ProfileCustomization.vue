<template>
  <div class="w-full max-w-sm mx-auto flex flex-col items-center gap-6 pt-4 cabin-sketch-regular">

    <!-- Profile Picture Selector -->
    <div class="relative z-30">
      <ProfilePictureSelector
        :img="user!.img"
        :customization="user?.customization"
        @update:img="uploadImage"
      />
    </div>

    <!-- Edit Form -->
    <div class="w-full space-y-3 px-2">

      <!-- Name Input -->
      <div
        class="w-full rounded-[1.5rem] bg-tertiary border shadow-sm p-5 flex flex-col items-center justify-center relative transition-colors"
        :class="nameError ? 'border-red-400/60' : 'border-primary/40'"
      >
        <div class="text-[11px] font-bold uppercase tracking-widest text-secondary mb-2">
          Artist Name
        </div>
        <ion-input
          ref="nameRef"
          color="secondary"
          :value="editForm.name"
          @ionInput="editForm.name = ($event.target as any).value"
          type="text"
          :maxlength="30"
          :minlength="4"
          placeholder="e.g. Skelur"
          class="w-full text-center text-3xl font-bold text-black"
          @ionBlur="onBlur"
          @keyup.enter="onEnter"
          enterkeyhint="done"
          autocapitalize="sentences"
        />

        <!-- Explain, in plain words, why the name won't save -->
        <p v-if="nameError" class="flex items-center gap-1.5 text-[13px] font-bold text-red-500 mt-2 text-center leading-snug">
          <ion-icon :icon="svg(mdiAlertCircleOutline)" class="text-base shrink-0" />
          {{ nameError }}
        </p>
      </div>

      <!-- Description Input -->
      <div class="w-full bg-tertiary border border-primary/40 rounded-[1.5rem] shadow-sm overflow-hidden px-6">
        <ion-textarea
          color="secondary"
          :value="editForm.description"
          @ionInput="editForm.description = ($event.target as any).value"
          placeholder="Add a short bio or description..."
          :maxlength="80"
          :auto-grow="true"
          :rows="3"
          class="font-medium text-black italic text-lg"
          @ionBlur="onBlur"
        />
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { IonIcon, IonInput, IonTextarea } from '@ionic/vue'
import { mdiAlertCircleOutline } from '@mdi/js'

import { useAuthStore } from '@/store/auth.store'
import { useToast } from '@/service/toast.service'
import { updateProfile, uploadProfileImg } from '@/service/api/user.api'
import { svg } from '@/helper/general.helper'

import ProfilePictureSelector from '@/components/account/ProfilePictureSelector.vue'
import { useProfileUpload } from '@/composables/general/useProfileUpload'

const props = defineProps<{
  skipToast?: boolean;
}>()

const { user } = storeToRefs(useAuthStore())
const { toast } = useToast()

const nameRef = ref<HTMLInputElement>()

// Reactive form state
const editForm = reactive({
  name: user.value?.name || '',
  description: user.value?.description || ''
})

// Live, human-readable reason the name can't be saved (empty on valid).
const nameError = computed(() => {
  const n = editForm.name.trim()
  if (!n) return "Your name can't be empty."
  if (n.length < 4) return 'Name needs at least 4 characters.'
  return ''
})

function saveProfile() {
  if (!user.value) return

  const newName = editForm.name.trim()
  const newDesc = editForm.description?.trim() || ''
  const oldName = user.value.name || ''
  const oldDesc = user.value.description || ''

  // 1. Validation — revert the field, no network work.
  if (!newName) {
    if (!props.skipToast) toast('Name cannot be empty', { color: 'danger' })
    editForm.name = oldName
    return
  }
  if (newName.length < 4) {
    if (!props.skipToast)
      toast('Name must be at least 4 characters', { color: 'danger' })
    editForm.name = oldName
    return
  }

  // 2. No change — nothing to persist.
  if (newName === oldName && newDesc === oldDesc) return

  // 3. Optimistic: apply locally NOW, persist in the background.
  const u = user.value
  u.name = newName
  u.description = newDesc

  void (async () => {
    try {
      await updateProfile({ name: newName, description: newDesc })
    } catch (err: any) {
      // Roll back — but only if the field still holds what we set
      // (guards against a newer edit racing this request).
      if (u.name === newName) u.name = oldName
      if (u.description === newDesc) u.description = oldDesc
      editForm.name = oldName
      editForm.description = oldDesc
      const errorMsg = err?.response?.data?.error || 'Failed to update profile'
      if (!props.skipToast) toast(errorMsg, { color: 'danger' })
    }
  })()
}

function onBlur() {
  saveProfile()
}

function onEnter() {
  // Trigger blur to force save
  (nameRef.value as any)?.blur()
}

const { uploadImage } = useProfileUpload()


</script>