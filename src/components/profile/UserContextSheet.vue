<template>
  <ion-modal
    :is-open="viewProfileMenuOpen"
    @did-dismiss="onDismiss"
    :initial-breakpoint="0.95"
    :breakpoints="[0, 0.95]"
    handle-behavior="cycle"
    class="liquid-user-sheet"
    :keepContentsMounted="true"
    :style="{ '--background': theme.cardBg, transition: 'background-color 0.5s ease' }"
  >
    <div class="h-full relative overflow-hidden rounded-t-[2.5rem]">
      <div class="absolute top-2 right-2 z-20">
        <ion-button @click="closeSheet" fill="clear" class="m-0" :style="{color: theme.nameColor}">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
        </ion-button>
      </div>

      <div class="absolute inset-0 pointer-events-none z-0">
        <ProfileEffect :effect-id="effectiveCustomization.effectId" />
        <ProfileWorld :world-id="effectiveCustomization.worldId" />
      </div>

      <div class="h-full overflow-y-auto hide-scrollbar relative z-10" @touchmove.stop>
        <div class="px-6 pb-24 pb-safe flex flex-col transition-all duration-500"
             :style="{ fontFamily: resolvedFontFamily }">

          <div class="relative w-full flex flex-col items-center text-center shrink-0 pt-8 pb-6">

            <div class="absolute inset-0 pointer-events-none z-0 flex justify-center">
              <div class="w-full h-full max-w-[360px] relative">
                <BackgroundSketch
                  :path="effectiveCustomization.backgroundSketchPath"
                  :view-box="effectiveCustomization.backgroundSketchViewBox"
                  :stroke-color="theme.nameColor"
                  class="absolute inset-0 w-full h-full"
                />
              </div>
            </div>

            <div class="relative z-10 flex flex-col items-center w-full">
              <div class="relative">
                <UserAvatar
                  v-if="resolvedUser"
                  :user="resolvedUser"
                  :customization="effectiveCustomization"
                  size="xl"
                />
                <div v-else
                     class="w-24 h-24 rounded-[2rem] bg-zinc-200 border-4 border-white shadow-sm animate-pulse"></div>

                <div
                  v-if="!isMe && isOnline"
                  class="absolute bottom-1 right-1 w-5 h-5 bg-green-500 rounded-full border-4 border-white shadow"
                ></div>
              </div>

              <TitleBadge
                v-if="effectiveCustomization.titleId"
                :title-id="effectiveCustomization.titleId"
                :theme="theme"
                extra-class="mt-4"
              />

              <h2
                class="text-3xl font-black mt-2 leading-tight drop-shadow-sm transition-colors duration-500"
                :style="{ color: theme.nameColor }"
                :class="fontEffectClass"
              >
                {{ resolvedUser?.name || 'Loading...' }}
              </h2>

              <div class="flex items-center gap-2 mt-2">
                <span v-if="isMe"
                      class="bg-secondary/10 text-secondary text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">That's You</span>
                <span v-else-if="isBlocked"
                      class="bg-black/10 text-black/80 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Blocked</span>
                <span v-else-if="status === 'mate'"
                      class="bg-secondary/10 text-secondary text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-secondary/20">Mates</span>
                <span v-else-if="status === 'temporary' || status === 'pending_mate'"
                      class="bg-secondary text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">Trial Active</span>
                <span v-if="targetProfile?.relationship?.areFollowingMe && !isFollowing && !isMe"
                      class="bg-black/5 text-black/80 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Follows You</span>
              </div>

              <div v-if="loadingProfile && !resolvedUser?.description"
                   class="mt-4 flex flex-col items-center gap-1.5 w-full px-8">
                <div class="h-3.5 w-full bg-black/5 rounded-full animate-pulse"></div>
                <div class="h-3.5 w-2/3 bg-black/5 rounded-full animate-pulse"></div>
              </div>
              <p v-else
                 class="text-sm font-bold italic mt-4 leading-snug whitespace-pre-wrap px-2 transition-colors duration-500"
                 :style="{ color: theme.descColor }">
                "{{ resolvedUser?.description || 'This artist is a mystery...' }}"
              </p>
            </div>
          </div>
          <div v-if="!isMe" class="mt-8 w-full shrink-0">
            <div
              class="flex flex-col overflow-hidden rounded-[1.5rem] border transition-colors duration-500 shadow-sm backdrop-blur-sm"
              :style="{ borderColor: theme.cardBorderColor, backgroundColor: 'rgba(255, 255, 255, 0.15)' }">
              <button
                class="flex items-center gap-3 w-full px-5 py-3.5 text-left active:bg-black/5 cursor-pointer transition-colors duration-200"
                @click="primaryCta.handler" :disabled="primaryCta.disabled">
                <ion-icon :icon="svg(primaryCta.icon)" class="text-xl" :style="{ color: theme.accentColor }" />
                <span class="text-sm font-black uppercase tracking-widest"
                      :style="{ color: theme.nameColor }">{{ primaryCta.label }}</span>
              </button>
              <div class="h-px w-full transition-colors duration-500"
                   :style="{ backgroundColor: theme.cardBorderColor }"></div>
              <button
                class="flex items-center gap-3 w-full px-5 py-3.5 text-left active:bg-black/5 cursor-pointer transition-colors duration-200"
                @click="onToggleFollow">
                <ion-icon :icon="svg(isFollowing ? mdiAccountMinusOutline : mdiAccountPlusOutline)"
                          class="text-xl transition-colors duration-500" :style="{ color: theme.nameColor }" />
                <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: theme.nameColor }">{{ isFollowing ? 'Unfollow' : 'Follow' }}</span>
              </button>
              <template v-if="canUnfriend">
                <div class="h-px w-full transition-colors duration-500"
                     :style="{ backgroundColor: theme.cardBorderColor }"></div>
                <button
                  class="flex items-center gap-3 w-full px-5 py-3.5 text-left active:bg-black/5 cursor-pointer transition-colors duration-200"
                  @click="onUnfriend">
                  <ion-icon :icon="svg(mdiHeartBroken)" class="text-xl transition-colors duration-500"
                            :style="{ color: theme.descColor }" />
                  <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                        :style="{ color: theme.descColor }">{{ status === 'mate' ? 'Unfriend Mate' : 'Cancel Connection'
                    }}</span>
                </button>
              </template>
              <div class="h-px w-full transition-colors duration-500"
                   :style="{ backgroundColor: theme.cardBorderColor }"></div>
              <button
                class="flex items-center gap-3 w-full px-5 py-3.5 text-left active:bg-black/5 cursor-pointer transition-colors duration-200"
                @click="confirmToggleBlock">
                <ion-icon :icon="svg(isBlocked ? mdiAccountReactivateOutline : mdiAccountCancelOutline)"
                          class="text-xl transition-colors duration-500" :style="{ color: theme.descColor }" />
                <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: theme.nameColor }">{{ isBlocked ? 'Unblock User' : 'Block User' }}</span>
              </button>
              <div class="h-px w-full transition-colors duration-500"
                   :style="{ backgroundColor: theme.cardBorderColor }"></div>
              <button
                class="flex items-center gap-3 w-full px-5 py-3.5 text-left active:bg-black/5 cursor-pointer transition-colors duration-200"
                @click="report">
                <ion-icon :icon="svg(mdiFlagVariantOutline)" class="text-xl transition-colors duration-500"
                          :style="{ color: theme.descColor }" />
                <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: theme.nameColor }">Report user</span>
              </button>
            </div>
          </div>

          <div v-if="targetProfile" class="grid grid-cols-3 w-full mt-8 border-t pt-5 transition-colors duration-500"
               :style="{ borderColor: theme.cardBorderColor }">
            <template v-if="loadingProfile && !resolvedUser?.stats">
              <div v-for="i in 3" :key="i" class="flex flex-col items-center" :class="{'border-x': i === 1}"
                   :style="{ borderColor: theme.cardBorderColor }">
                <div class="h-6 w-8 bg-black/5 rounded animate-pulse mb-1"></div>
                <div class="h-2 w-12 bg-black/5 rounded animate-pulse"></div>
              </div>
            </template>
            <template v-else>
              <button class="flex flex-col items-center active:scale-95 cursor-pointer transition-transform"
                      @click="goToNetwork('mates')">
                <span class="text-xl font-black transition-colors duration-500"
                      :style="{ color: theme.accentColor }">{{ targetProfile.stats?.mates || 0 }}</span>
                <span class="text-[9px] font-bold uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: theme.descColor }">Mates</span>
              </button>
              <button class="flex flex-col items-center active:scale-95 cursor-pointer transition-transform border-x"
                      :style="{ borderColor: theme.cardBorderColor }" @click="goToNetwork('followers')">
                <span class="text-xl font-black transition-colors duration-500"
                      :style="{ color: theme.nameColor }">{{ targetProfile.stats?.followers || 0 }}</span>
                <span class="text-[9px] font-bold uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: theme.descColor }">Followers</span>
              </button>
              <button class="flex flex-col items-center active:scale-95 cursor-pointer transition-transform"
                      @click="goToNetwork('following')">
                <span class="text-xl font-black transition-colors duration-500"
                      :style="{ color: theme.nameColor }">{{ targetProfile.stats?.following || 0 }}</span>
                <span class="text-[9px] font-bold uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: theme.descColor }">Following</span>
              </button>
            </template>
          </div>

          <div v-if="effectiveCustomization.signaturePath"
               class="mt-6 pt-4 border-t flex flex-col items-center transition-colors duration-500"
               :style="{ borderColor: theme.cardBorderColor }">
            <span class="text-[10px] font-bold uppercase tracking-widest mb-1 transition-colors duration-500"
                  :style="{ color: theme.descColor }">— Signed —</span>
            <svg class="w-32 h-12 drop-shadow-sm transition-colors duration-500"
                 :viewBox="effectiveCustomization.signatureViewBox || '0 0 300 150'"
                 preserveAspectRatio="xMidYMid meet">
              <path :d="effectiveCustomization.signaturePath" fill="none" :stroke="theme.accentColor"
                    :stroke-width="signatureStrokeWidth" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>

          <div class="mt-8 mb-16">
            <div class="flex items-center justify-between mb-3 px-1">
              <h3 class="text-lg font-black italic transition-colors duration-500" :style="{ color: theme.nameColor }">
                Portfolio</h3>
            </div>
            <div v-if="loadingProfile && targetPosts.length === 0" class="grid grid-cols-3 gap-2">
              <div v-for="i in 6" :key="i" class="aspect-square bg-black/5 rounded-[1.5rem] animate-pulse"></div>
            </div>
            <div v-else-if="targetPosts.length === 0"
                 class="text-center py-10 rounded-[2rem] border-2 border-dashed transition-colors duration-500"
                 :style="{ borderColor: theme.cardBorderColor, backgroundColor: 'rgba(0,0,0,0.02)' }">
              <p class="text-sm font-bold italic transition-colors duration-500" :style="{ color: theme.descColor }">No
                public sketches yet.</p>
            </div>
            <div v-else class="grid grid-cols-3 gap-2">
              <div v-for="(post, index) in targetPosts" :key="post._id"
                   class="aspect-square rounded-[1.5rem] shadow-sm relative overflow-hidden active:scale-95 cursor-pointer transition-transform duration-200"
                   :style="{ backgroundColor: theme.cardBorderColor }" @click="onOpenPost(index)">
                <img :src="post.thumbnail_url" class="w-full h-full object-cover" loading="lazy" alt="sketch" />
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { alertController, IonButton, IonIcon, IonModal } from '@ionic/vue'
import {
  mdiAccountCancelOutline,
  mdiAccountMinusOutline,
  mdiAccountPlusOutline,
  mdiAccountReactivateOutline,
  mdiAlertCircleOutline,
  mdiChatOutline,
  mdiHeartBroken,
  mdiTimerSandComplete,
  mdiFlagVariantOutline, mdiClose
} from '@mdi/js'
import { compareVersions, svg } from '@/helper/general.helper'

import UserAvatar from '@/components/profile/customization/UserAvatar.vue'
import ProfileEffect from '@/components/profile/customization/ProfileEffect.vue'
import ProfileWorld from '@/components/profile/ProfileWorld.vue'
import BackgroundSketch from '@/components/profile/customization/BackgroundSketch.vue'
import TitleBadge from '@/components/profile/TitleBadge.vue'

import { useAuthStore } from '@/store/auth.store'
import { useChatWidgetStore } from '@/store/chatWidget.store'
import { useFriendStore } from '@/store/friend.store'
import { useMenuStore } from '@/store/menu.store'
import { useUserContextSheet } from '@/composables/profile/useUserContextSheet'
import { usePostSwiper } from '@/composables/home/usePostSwiper'

import {
  blockUser,
  unblockUser,
  unfriendUser
} from '@/service/api/relationship.api'
import { useToast } from '@/service/toast.service'
import {
  calculateSignatureStroke,
  hydrateCustomization,
  resolveFontEffectClass,
  resolveFontFamily,
  resolveTheme
} from '@/config/profile_options.config'
import { useDrawSyncer } from '@/draw/store/drawSyncing.store'
import { useDrawObjectManager } from '@/draw/store/drawObjectManager.store'
import { useChatStore } from '@/store/chat.store'
import { useModerationStore } from '@/store/moderation.store'

const MIN_CHAT_VERSION = '0.4.3'

const menuStore = useMenuStore()
const authStore = useAuthStore()
const chatWidget = useChatWidgetStore()
const friendStore = useFriendStore()
const { closeSheet } = useUserContextSheet()
const { openPostSwiper } = usePostSwiper()
const { toast } = useToast()

const { viewProfileMenuOpen } = storeToRefs(menuStore)
const { targetProfile, targetPosts, loadingProfile, isFriendOnline } =
  storeToRefs(friendStore)
const { user: me } = storeToRefs(authStore)

const resolvedUser = computed(() =>
  targetProfile.value?._id ? targetProfile.value : null
)

const resolvedCustomization = computed<Partial<any>>(() => {
  return (resolvedUser.value?.customization as any) || {}
})
const effectiveCustomization = computed(() =>
  hydrateCustomization(resolvedCustomization.value)
)
const theme = computed(() =>
  resolveTheme(effectiveCustomization.value.themeId)
)
const resolvedFontFamily = computed(() =>
  resolveFontFamily(effectiveCustomization.value.fontId)
)
const fontEffectClass = computed(() =>
  resolveFontEffectClass(effectiveCustomization.value.fontEffectId)
)
const signatureStrokeWidth = computed(() =>
  calculateSignatureStroke(effectiveCustomization.value.signatureViewBox)
)

const isMe = computed(() => targetProfile.value?._id === me.value?._id)
const isBlocked = computed(() =>
  targetProfile.value?._id
    ? friendStore.isBlocked(targetProfile.value._id)
    : false
)
const isOnline = computed(() =>
  targetProfile.value?._id
    ? isFriendOnline.value(targetProfile.value._id)
    : false
)

const status = computed(() => {
  if (!targetProfile.value?._id) return undefined
  return (
    (targetProfile.value as any).chat_status ||
    friendStore.resolvePartnerInfo(targetProfile.value._id)?.chat_status
  )
})

const isFollowing = computed(() => {
  if (!targetProfile.value?._id) return false
  if (targetProfile.value.relationship)
    return targetProfile.value.relationship.isFollowing
  return friendStore.networkLists.following.some(
    (f) => f._id === targetProfile.value?._id
  )
})

const canUnfriend = computed(() =>
  ['mate', 'temporary', 'pending_mate'].includes(status.value as string)
)

const hasRequiredVersion = computed(() => {
  const v = resolvedUser.value?.last_seen_version
  return v ? compareVersions(v, MIN_CHAT_VERSION) !== -1 : false
})

const primaryCta = computed(() => {
  if (isBlocked.value) {
    return {
      label: 'User Blocked',
      icon: mdiAccountCancelOutline,
      disabled: true,
      handler: () => {
      }
    }
  }
  if (!hasRequiredVersion.value) {
    return {
      label: 'User needs to update to chat',
      icon: mdiAlertCircleOutline,
      disabled: true,
      handler: () => {
      }
    }
  }
  if (status.value === 'mate') {
    return {
      label: 'Message',
      icon: mdiChatOutline,
      disabled: false,
      handler: onStartChat
    }
  }
  if (['temporary', 'pending_mate'].includes(status.value as string)) {
    return {
      label: 'Continue Chat',
      icon: mdiTimerSandComplete,
      disabled: false,
      handler: onStartChat
    }
  }
  return {
    label: 'Message',
    icon: mdiChatOutline,
    disabled: false,
    handler: onStartChat
  }
})

function onDismiss() {
  viewProfileMenuOpen.value = false
}

function onStartChat() {
  if (!targetProfile.value?._id || !hasRequiredVersion.value) return
  chatWidget.openChatWithUser(targetProfile.value._id)
  closeSheet()
}

function onOpenPost(index: number) {
  openPostSwiper(targetPosts.value, index)
}

function goToNetwork(_tab: 'mates' | 'followers' | 'following') {
  /* Stub */
}

async function onToggleFollow() {
  if (!targetProfile.value || isMe.value) return
  const artistName = targetProfile.value.name
  try {
    const nowFollowing = await friendStore.toggleFollowUser(
      targetProfile.value as any
    )
    if (targetProfile.value.relationship)
      targetProfile.value.relationship.isFollowing = !!nowFollowing
    toast(
      nowFollowing ? `Following ${artistName}` : `Unfollowed ${artistName}`
    )
  } catch {
    toast('Action failed', { color: 'danger' })
  }
}

async function onUnfriend() {
  if (!targetProfile.value) return
  const isPermanent = status.value === 'mate'
  const partner = targetProfile.value

  const alert = await alertController.create({
    header: isPermanent ? 'Unfriend?' : 'End Trial?',
    cssClass: 'liquid-alert',
    message: isPermanent
      ? `Remove ${partner.name}? Chat invites locked for 48h.`
      : `Stop chatting with ${partner.name}?`,
    buttons: [
      { text: 'Keep', role: 'cancel' },
      {
        text: isPermanent ? 'Remove' : 'End',
        role: 'destructive',
        handler: async () => {
          try {
            await unfriendUser(partner._id)
            friendStore.removeFriendLocally(partner._id)
            toast(isPermanent ? `Removed ${partner.name}` : 'Trial ended')
            closeSheet()
          } catch {
            toast('Action failed', { color: 'danger' })
          }
        }
      }
    ]
  })
  await alert.present()
}

async function confirmToggleBlock() {
  if (!targetProfile.value) return
  const target = targetProfile.value

  if (isBlocked.value) {
    try {
      void unblockUser(target._id)
      friendStore.unblockUserLocally(target._id)
      useChatStore().resetChatWithUser(target._id)
      toast(`${target.name} unblocked`)
    } catch {
      toast('Action failed', { color: 'danger' })
    }
    return
  }

  const alert = await alertController.create({
    header: 'Block User?',
    message: `Are you sure you want to block ${target.name}? They will no longer be able to message you or see your sketches.`,
    cssClass: 'liquid-alert',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Block',
        role: 'destructive',
        handler: async () => {
          try {
            await blockUser(target._id)
            friendStore.blockUserLocally(target._id)
            if (useDrawSyncer().isLobby) {
              useDrawObjectManager().purgeBlockedObjects()
            }

            toast(`${target.name} blocked`)
            closeSheet()
          } catch {
            toast('Action failed', { color: 'danger' })
          }
        }
      }
    ]
  })
  await alert.present()
}

function report() {
  useModerationStore().openReport({
    type: 'user',
    id: targetProfile.value._id,
    label: targetProfile.value.name
  })
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.pb-safe {
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);
}

ion-modal.liquid-user-sheet {
  --border-radius: 2.5rem 2.5rem 0 0;
}

ion-modal.liquid-user-sheet::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>