<template>
  <ion-modal
    :is-open="moderationMenuOpen"
    @did-dismiss="handleDismiss"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="moderation-bottom-modal"
  >
    <div v-if="notice" class="h-full flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden">

      <!-- Header -->
      <div class="shrink-0 pt-2 mb-6 text-center relative">
        <div class="text-5xl mb-3">{{ levelEmoji }}</div>
        <h1
          class="text-3xl font-black tracking-tighter italic leading-none"
          :class="modStore.level >= 4 ? 'text-red-500' : 'text-amber-500'"
        >
          Action Paused
        </h1>
        <p class="text-xs font-bold opacity-60 uppercase tracking-widest mt-2">
          Level {{ notice.level }} Restriction
        </p>
      </div>

      <!-- Content Area -->
      <div
        class="flex-1 overflow-y-auto px-1 space-y-3 hide-scrollbar pb-4"
        style="min-height: 250px;"
        @touchmove.stop
      >
        <!-- Primary Message Card -->
        <div class="group relative flex items-center gap-4 p-5 rounded-[2rem] border bg-white border-white shadow-sm">
          <div class="flex-1 min-w-0">
            <span class="font-black text-lg leading-none block text-black">
              Action Blocked
            </span>
            <p class="text-[13px] font-bold text-black/60 mt-2 leading-snug italic">
              You cannot perform this action right now because your account is currently restricted.
            </p>
          </div>
        </div>

        <!-- Reason Card -->
        <div v-if="notice.reason" class="group relative flex items-center gap-4 p-4 rounded-[2rem] border bg-white/40 border-white shadow-sm">
          <div class="w-12 h-12 rounded-2xl bg-white/80 shadow-inner flex items-center justify-center text-xl shrink-0">
            ⚠️
          </div>
          <div class="flex-1 min-w-0">
            <span class="font-black text-lg leading-none block text-black">
              Reason
            </span>
            <p class="text-[12px] font-bold text-black/50 mt-1 leading-tight italic">
              {{ reasonLabel(notice.reason) }}
            </p>
          </div>
        </div>

        <!-- Expiry Card -->
        <div v-if="notice.expires_at" class="group relative flex items-center gap-4 p-4 rounded-[2rem] border bg-white/40 border-white shadow-sm">
          <div class="w-12 h-12 rounded-2xl bg-white/80 shadow-inner flex items-center justify-center text-xl shrink-0">
            ⏳
          </div>
          <div class="flex-1 min-w-0">
            <span class="font-black text-lg leading-none block text-black">
              Restriction Lifts
            </span>
            <p class="text-[12px] font-bold text-black/50 mt-1 leading-tight italic">
              {{ formatExpiry(notice.expires_at) }}
            </p>
          </div>
        </div>
      </div>

      <div class="pt-4 pb-2 shrink-0">
        <ion-button
          expand="block"
          :color="modStore.level >= 4 ? 'danger' : 'warning'"
          shape="round"
          @click="goToStanding"
        >
          Review
        </ion-button>
        <ion-button
          fill="clear"
          color="dark"
          expand="block"
          class="mt-2"
          @click="handleDismiss"
        >
          Got it
        </ion-button>
      </div>

    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { IonModal, IonButton, useIonRouter } from '@ionic/vue'
import dayjs from 'dayjs'

import { useMenuStore } from '@/store/menu.store'
import { useModerationStore } from '@/store/moderation.store'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { masterAnimation } from '@/helper/animation.helper'

const router = useIonRouter()
const modStore = useModerationStore()
const menuStore = useMenuStore()

const { pendingStrikeNotice: notice } = storeToRefs(modStore)
const { moderationMenuOpen } = storeToRefs(menuStore)

// --- ACTIONS ---

const handleDismiss = () => {
  moderationMenuOpen.value = false
  // Small delay so the swipe-down animation finishes before clearing the store
  setTimeout(() => {
    modStore.dismissStrikeNotice()
  }, 300)
}

const goToStanding = () => {
  handleDismiss()
  router.push(FRONTEND_ROUTES.moderation, masterAnimation)
}

// --- COMPUTED ---

const levelEmoji = computed(() => {
  if (!notice.value) return '⚠️'
  const map = ['✨', '⚠️', '🎈', '📛', '🔍', '🚫']
  return map[notice.value.level] ?? '⚠️'
})

// --- HELPERS ---

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    minor_safety:  'Minor safety',
    nsfw:          'Sexual content',
    violence:      'Violence',
    harassment:    'Harassment',
    hate_speech:   'Hate speech',
    spam:          'Spam',
    impersonation: 'Impersonation',
    other:         'Rule Violation'
  }
  return map[reason] ?? reason
}

function formatExpiry(iso: string): string {
  const d = dayjs(iso)
  if (d.isBefore(dayjs())) return 'Lifting now…'
  return d.format('MMM D, h:mm A')
}
</script>

<style scoped>
@reference "@/theme/main.css";

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

ion-modal.moderation-bottom-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --height: auto;
  --max-height: 90vh;
  --background: var(--ion-color-tertiary, #f3f4f6);
}

ion-modal.moderation-bottom-modal::part(handle) {
  background: var(--ion-color-dark, #000);
  opacity: 0.15;
  width: 40px;
}

.overflow-y-auto {
  mask-image: linear-gradient(to bottom, black 95%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, black 95%, transparent 100%);
}
</style>