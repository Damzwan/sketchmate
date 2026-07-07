<template>
  <div class="w-full flex flex-col gap-3">

    <div
      v-if="firebaseUser?.isAnonymous"
      class="w-full rounded-[1.5rem] border border-amber-500/30 bg-amber-500/5 p-4 relative overflow-hidden flex flex-col shadow-sm"
    >
      <div class="relative z-10">
        <h3 class="cabin-sketch-regular text-xl font-black text-amber-900 leading-none mb-1">
          Guest Profile
        </h3>
        <p class="text-[13px] font-bold text-amber-800/80 leading-tight mb-3 pr-4">
          Create an account to save your progress and unlock social features.
        </p>
        <ion-button
          shape="round"
          color="warning"
          size="small"
          id="openUpgradeAccountModal"
          class="font-bold self-start inline-block"
        >
          Connect Account
        </ion-button>
      </div>

      <div class="absolute -right-6 -bottom-6 w-24 h-24 bg-amber-500/10 rounded-full blur-xl pointer-events-none"></div>

      <UpgradeAccountModal />
    </div>

    <SettingCard :icon="mdiCakeVariantOutline" @click="openAgeModal">
      <template #label>
        <span class="block font-bold text-black text-base leading-tight">Date of birth</span>
        <span v-if="user?.date_of_birth" class="block text-[12px] text-black/50 mt-0.5 truncate">
          {{ formattedDob }}
          <span v-if="isUnderAge" class="text-amber-700">· social features hidden</span>
        </span>
        <span v-else class="block text-[12px] text-amber-600 font-bold mt-0.5">
          Not set — tap to add
        </span>
      </template>
      <template #trailing>
        <ion-icon :icon="svg(mdiPencilOutline)" class="text-lg text-black/30" />
      </template>
    </SettingCard>

    <SettingCard :icon="mdiPalette" @click="goToCustomization()">
      <template #label>
        <span class="block font-bold text-black text-base leading-tight">Customization</span>
      </template>
      <template #trailing>
        <ion-icon :icon="svg(mdiPencilOutline)" class="text-lg text-black/30" />
      </template>
    </SettingCard>

  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonButton, useIonRouter } from '@ionic/vue'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'
import { mdiCakeVariantOutline, mdiPalette, mdiPencilOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { useAuthStore } from '@/store/auth.store'
import { useDateOfBirthModalStore } from '@/store/dateOfBirth.store'
import UpgradeAccountModal from '@/components/settings/UpgradeAccountModal.vue'
import SettingCard from '@/components/settings/SettingCard.vue'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { masterAnimation } from '@/helper/animation.helper'

const r = useIonRouter()

const { user, firebaseUser, isUnderAge } = storeToRefs(useAuthStore())
const dobModal = useDateOfBirthModalStore()

const formattedDob = computed(() =>
  user.value?.date_of_birth
    ? dayjs(user.value.date_of_birth).format('MMM D, YYYY')
    : ''
)

function openAgeModal() {
  const mode = user.value?.date_of_birth ? 'edit' : 'initial'
  void dobModal.open(mode)
}

function goToCustomization() {
  r.push(FRONTEND_ROUTES.customization, masterAnimation)
}
</script>