<template>
  <section
    class="mt-16 rounded-[3rem] border-2 shadow-lg relative px-6 pb-8 pt-4 transition-all duration-500 cabin-sketch-regular"
    :style="{
      borderColor: customization.cardBorderColor || 'rgba(0,0,0,0.12)',
      backgroundColor: customization.cardBgColor || undefined,
      fontFamily: resolvedFontFamily,
    }"
    :class="cardBgClass"
  >
    <!-- Actions -->
    <div class="absolute top-4 right-4 flex items-center justify-end min-w-[80px] z-50">
      <transition name="fade">
        <ion-button v-if="!isEditing" fill="clear" color="secondary" @click="$emit('go-settings')" class="m-0">
          <ion-icon slot="icon-only" class="text-black" :icon="svg(mdiCog)" />
        </ion-button>
      </transition>
      <ion-button fill="clear" color="secondary" @click="$emit('toggle-edit')" class="m-0">
        <ion-icon slot="icon-only" class="text-black" :icon="svg(isEditing ? mdiCheck : mdiPencil)" />
      </ion-button>
    </div>

    <div class="flex flex-col items-center -mt-20 relative z-20">
      <!-- Avatar -->
      <div class="relative z-30">
        <UserAvatar v-if="!isEditing" :user="user" :customization="customization" size="xl" />
        <ProfilePictureSelector
          v-else
          :img="user.img"
          :customization="customization"
          @update:img="$emit('update-img', $event)"
        />
      </div>

      <!-- Display mode -->
      <template v-if="!isEditing">
        <div class="text-center mt-4 w-full flex flex-col items-center">
          <span
            v-if="displayTitle"
            class="text-[10px] font-black uppercase tracking-widest px-3 py-0.5 rounded-full mb-1"
            :style="{ background: 'rgba(0,0,0,0.05)', color: customization.nameColor || '#18181b' }"
          >
            {{ displayTitle }}
          </span>

          <h2
            class="text-3xl font-black drop-shadow-sm transition-colors duration-500"
            :style="{ color: customization.nameColor || '#18181b' }"
            :class="fontEffectClass"
          >
            {{ user.name }}
          </h2>

          <p
            class="text-sm font-bold italic mt-3 px-4 leading-snug whitespace-pre-wrap transition-colors duration-500"
            :style="{ color: customization.descColor || 'rgba(0,0,0,0.6)' }"
          >
            "{{ user.description || 'No description yet.' }}"
          </p>

          <div class="flex gap-2 mt-4">
            <ion-button fill="solid" color="secondary" shape="round" @click="$emit('open-connection')">
              <ion-icon slot="start" :icon="svg(mdiAccountPlusOutline)" class="mr-1" />
              Add / Share
            </ion-button>
          </div>
        </div>
      </template>

      <!-- Edit mode -->
      <template v-else>
        <div class="w-full mt-6 space-y-4 px-2">

          <!-- Identity Section -->
          <div
            class="w-full rounded-[2.5rem] p-5 transition-all duration-300 flex flex-col items-center justify-center relative"
            :class="isNameChangeLocked ? 'bg-black/5 border-2 border-dashed border-black/10' : 'bg-white/70 border-2 border-white shadow-inner'"
          >
            <div v-if="isNameChangeLocked" class="flex flex-col items-center text-center">
              <div
                class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-secondary mb-2">
                <ion-icon :icon="svg(mdiClockOutline)" />
                Wait {{ daysRemaining }} Days
              </div>
              <h2 class="text-2xl font-black text-black/20 line-through decoration-secondary/40 decoration-2">
                {{ user.name }}
              </h2>

              <ion-button
                @click.stop="subStore.presentPaywall()"
                shape="round"
                color="secondary"
                size="small"
                class="mt-1"
              >
                Unlock with Pro ⚡
              </ion-button>
            </div>

            <div v-else class="w-full flex flex-col items-center">
              <div
                class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-black/40 mb-2">
                <ion-icon :icon="svg(mdiAlertCircleOutline)" class="text-secondary" v-if="hasNameChanged" />
                {{ isPro ? 'Pro: Unlimited Changes' : 'New Identity' }}
              </div>
              <input
                :value="editForm.name"
                placeholder="Artist Name"
                class="w-full bg-transparent text-center text-2xl font-black text-black focus:outline-none"
                @input="$emit('update:editFormName', ($event.target as HTMLInputElement).value)"
              />

              <!-- Warning for non-pro users -->
              <p v-if="hasNameChanged && !isPro"
                 class="mt-3 text-[12px] font-bold text-secondary uppercase leading-tight text-center">
                ⚠️ Careful: Once saved, you can't change <br /> this again for 31 days.
              </p>
            </div>
          </div>

          <!-- Description -->
          <textarea
            :value="editForm.description"
            rows="3"
            class="w-full bg-white/60 border-2 border-white rounded-[2.5rem] px-6 py-4 text-base font-bold text-black italic shadow-inner focus:outline-none resize-none"
            @input="$emit('update:editFormDesc', ($event.target as HTMLTextAreaElement).value)"
          ></textarea>
        </div>
      </template>

      <!-- Stats bar -->
      <!-- Stats bar -->
      <div
        class="grid grid-cols-3 w-full mt-6 border-t pt-4 transition-colors duration-500"
        :style="{ borderColor: customization.cardBorderColor || 'rgba(0,0,0,0.1)' }"
      >
        <button v-for="stat in (['mates', 'followers', 'following'] as const)" :key="stat"
                class="flex flex-col items-center active:scale-95 transition-transform relative"
                :class="{ 'border-x': stat === 'followers' }"
                :style="stat === 'followers' ? { borderColor: customization.cardBorderColor || 'rgba(0,0,0,0.1)' } : {}"
                @click="$emit('go-network', stat)"
        >

          <span class="block text-xl font-black" :class="stat === 'mates' ? 'text-secondary' : 'text-black'">
      {{ formatStatNumber(getStatCount(stat)) }}
    </span>

          <span class="text-[9px] font-bold text-black/50 uppercase tracking-widest flex items-center gap-1">
      {{ stat }}

    </span>
        </button>
      </div>
    </div>

    <!-- Signature overlay -->
    <transition name="fade">
      <svg
        v-if="customization.signaturePath && !isEditing"
        class="absolute bottom-22 right-0 w-28 h-16 opacity-80 rotate-[-8deg] pointer-events-none drop-shadow-sm z-30"
        :viewBox="customization.signatureViewBox || '0 0 300 150'"
      >
        <path
          :d="customization.signaturePath"
          fill="none"
          :stroke="customization.signatureColor || customization.nameColor || '#18181b'"
          :stroke-width="signatureStrokeWidth"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </transition>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { IonButton, IonIcon } from '@ionic/vue'
import { mdiAccountPlusOutline, mdiAlertCircleOutline, mdiCheck, mdiClockOutline, mdiCog, mdiPencil } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import UserAvatar from '@/components/profile/customization/UserAvatar.vue'
import ProfilePictureSelector from '@/components/account/ProfilePictureSelector.vue'
import { useSubscriptionStore } from '@/store/subscription.store'

// Logic & Config Imports
import {
  calculateSignatureStroke,
  CARD_BG_MAP,
  FONT_EFFECT_MAP,
  formatStatNumber,
  NAME_CHANGE_COOLDOWN_DAYS,
  resolveFontFamily,
  resolveTitle
} from '@/config/profile_options.config'
import { Button } from '@ionic/core/dist/types/components/button/button'

const props = defineProps<{
  user: any // This is now a full User object containing stats
  customization: Record<string, any>
  isEditing: boolean
  editForm: { name: string; description: string }
}>()
defineEmits(['toggle-edit', 'go-settings', 'update-img', 'go-network', 'open-connection', 'update:editFormName', 'update:editFormDesc'])

const subStore = useSubscriptionStore()

// ─── Computed ─────────────────────────────────────────────────────────────────
const isPro = computed(() => subStore.isPro)

const daysRemaining = computed(() => {
  if (!props.user.last_name_change) return 0
  const diff = (NAME_CHANGE_COOLDOWN_DAYS || 31) - dayjs().diff(dayjs(props.user.last_name_change), 'day')
  return diff > 0 ? diff : 0
})

const isNameChangeLocked = computed(() => {
  if (isPro.value) return false // Pro bypass
  return daysRemaining.value > 0
})

const getStatCount = (key: 'mates' | 'followers' | 'following') => {
  return props.user.stats?.[key] || 0
}

const cardBgClass = computed(() => CARD_BG_MAP[props.customization.cardBg] ?? CARD_BG_MAP.frost)
const resolvedFontFamily = computed(() => resolveFontFamily(props.customization.fontFamily))
const fontEffectClass = computed(() => FONT_EFFECT_MAP[props.customization.fontEffect] ?? '')
const signatureStrokeWidth = computed(() => calculateSignatureStroke(props.customization.signatureViewBox))
const displayTitle = computed(() => resolveTitle(props.customization.titleId))

const hasNameChanged = computed(() => {
  return props.editForm.name.trim() !== props.user.name
})
</script>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>