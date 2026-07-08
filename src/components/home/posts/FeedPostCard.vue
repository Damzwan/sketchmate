<template>
  <div class="post-container relative w-full overflow-visible" :data-post-id="post._id">
    <div
      class="rounded-[2.25rem] border border-primary/40 shadow-sm overflow-hidden pt-3.5 flex flex-col h-full bg-tertiary"
    >
      <div class="px-4 pb-3 shrink-0">
        <div class="flex items-center justify-between">
          <button
            @click="openUser(post.author._id)"
            class="flex items-center active:scale-98 transition-all text-left min-w-0"
          >
            <div class="flex items-center justify-center shrink-0">
              <UserAvatar
                :user="post.author"
                :customization="authorCustomization"
                size="sm"
                static
              />
            </div>

            <div class="ml-3 flex flex-col justify-center min-w-0">
              <div class="flex items-baseline gap-1 truncate">
                <p
                  class="text-sm p-2 leading-none font-black drop-shadow-sm truncate"
                  :class="fontEffectClass"
                  :style="{ color: theme.nameColor, fontFamily: resolvedFontFamily }"
                >
                  {{ post.author.name }}
                </p>
                <span
                  v-if="displayTitle"
                  class="text-xs font-black uppercase tracking-widest opacity-70 shrink-0 truncate ml-0.5"
                  :style="{ color: theme.descColor }"
                >
                  · {{ displayTitle }}
                </span>
              </div>
              <p class="text-xs text-black/60 uppercase mt-1 tracking-wider">
                {{ dayjs(post.createdAt).fromNow() }}
              </p>
            </div>
          </button>

          <button @click="presentActionSheet"
                  class="p-2 active:scale-90 transition-transform shrink-0 text-black/30 hover:text-black">
            <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-xl" />
          </button>
        </div>

        <p v-if="post.description"
           class="cabin-sketch-regular text-base font-bold text-black/80 line-clamp-2 mt-2 px-0.5 leading-snug">
          {{ post.description }}
        </p>
      </div>

      <div
        ref="reactionSurface"
        class="relative w-full flex items-center justify-center overflow-hidden bg-[#FAF8F5] border-y border-primary/10 select-none"
        @dblclick="handleDoubleTap"
      >
        <img
          :src="post.image_url"
          class="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-40 pointer-events-none transition-opacity duration-500"
          :class="imageLoaded ? 'opacity-40' : 'opacity-0'"
          alt=""
        />

        <div class="absolute inset-0 z-[5] pointer-events-none dynamic-edge-vignette" />

        <img
          :src="post.image_url"
          class="relative z-10 w-full object-contain transition-opacity duration-500 max-h-[50vh]"
          :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
          @load="imageLoaded = true"
          alt="Main illustration content"
        />

        <!--
          Signature plaque: framed on a small frosted card with the author's name
          underneath, so it reads as a clear signed attribution rather than part
          of the artwork itself. Kept pointer-events-none so it never blocks the
          double-tap-to-react gesture.
        -->
        <div
          v-if="authorCustomization.signaturePath"
          class="absolute bottom-2.5 right-2.5 z-20 pointer-events-none transition-opacity duration-500"
          :class="imageLoaded ? 'opacity-100' : 'opacity-0'"
        >
          <div
            class="flex flex-col items-center rounded-xl bg-white/75 backdrop-blur-md px-2 pt-1 pb-1 shadow-sm border border-black/5"
          >
            <svg
              class="w-14 h-7"
              :viewBox="authorCustomization.signatureViewBox || '0 0 300 150'"
              preserveAspectRatio="xMidYMid meet"
            >
              <path
                :d="authorCustomization.signaturePath"
                fill="none"
                :stroke="theme.accentColor || 'var(--ion-color-secondary)'"
                :stroke-width="signatureStrokeWidth"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class="text-[7px] font-black uppercase tracking-[0.2em] text-black/70 leading-none mt-0.5">
              {{ post.author.name }}
            </span>
          </div>
        </div>

        <ReactionBurst ref="reactionBurst" />
      </div>

      <!-- Footer: reaction proof · action bar · comment previews -->
      <div class="px-4 pt-3 pb-4 shrink-0 flex flex-col gap-3">
        <!-- Reaction social proof: tappable pill opening a full breakdown -->
        <button
          v-if="totalReactionCount > 0"
          @click="showReactionSheet = true"
          class="flex items-center gap-2 self-start cursor-pointer active:scale-95 hover:scale-[1.02] transition-all"
          aria-label="See who reacted"
        >
          <div class="flex items-center">
            <div
              v-for="(key, i) in activeReactions.slice(0, 3)"
              :key="key"
              class="w-8 h-8 rounded-full bg-white shadow-sm border border-black/5 flex items-center justify-center"
              :class="i !== 0 ? '-ml-2.5' : ''"
              :style="{ zIndex: 3 - i }"
            >
              <img :src="reactionImages[key]" class="w-5 h-5 object-contain" alt="" />
            </div>
          </div>
          <span class="text-sm font-black text-black/80 tracking-tight">
            {{ totalReactionCount }}
            <span class="text-black/50">{{ totalReactionCount === 1 ? 'reaction' : 'reactions' }}</span>
          </span>
          <ion-icon :icon="svg(mdiChevronRight)" class="text-base text-black/30 -ml-0.5" />
        </button>

        <!-- Action bar: one cohesive, clear button style -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <!-- React -->
            <button
              @click="(e) => $emit('open-reaction-popover', { event: e, post })"
              class="flex items-center cursor-pointer hover:scale-105 justify-center h-9 px-3 rounded-full border active:scale-95 transition-all"
              :class="post.user_reaction
                ? 'bg-secondary/10 border-secondary/30 text-secondary'
                : 'bg-white border-black/10 text-black/80'"
              aria-label="React"
            >
              <img
                v-if="post.user_reaction"
                :src="reactionImages[post.user_reaction]"
                class="w-5 h-5 object-contain"
                alt=""
              />
              <ion-icon v-else :icon="svg(mdiHeartOutline)" class="text-lg" />
            </button>

            <!-- Comment (count lives here, Instagram-style) -->
            <button
              v-if="post.enable_comments"
              @click="openComments"
              class="flex items-center gap-1.5 h-9 cursor-pointer hover:scale-105 px-3.5 rounded-full bg-white border border-black/10 text-black/80 active:scale-95 transition-all"
            >
              <ion-icon :icon="svg(mdiChatOutline)" class="text-lg" />
              <span v-if="post.comment_count" class="text-sm font-black tracking-tight">
                {{ post.comment_count }}
              </span>
            </button>

            <!-- Share -->
            <button
              @click="openShare"
              class="flex items-center justify-center cursor-pointer hover:scale-105 h-9 w-9 rounded-full bg-white border border-black/10 text-black/80 active:scale-95 transition-all"
              aria-label="Share"
            >
              <ion-icon :icon="svg(mdiSendOutline)" class="text-base -rotate-12" />
            </button>
          </div>

          <!-- Remix: demoted to a neutral pill, matching the rest -->
          <button
            v-if="post.enable_remix"
            @click="remixPost"
            class="flex items-center gap-1.5 h-9 px-3 cursor-pointer hover:scale-105 rounded-full bg-white border border-black/10 text-black/70 hover:text-black active:scale-95 transition-all"
          >
            <ion-icon :icon="svg(mdiPencilOutline)" class="text-sm" />
            <span class="text-[11px] font-black uppercase tracking-wider">Remix</span>
          </button>
        </div>

        <!-- Comment previews -->
        <div
          v-if="previewComments.length"
          @click="openComments"
          class="cursor-pointer active:opacity-70 transition-opacity flex flex-col gap-1"
        >
          <div
            v-for="comment in previewComments"
            :key="comment._id"
            class="flex items-start gap-1.5 text-xs leading-snug"
          >
            <span class="text-black font-black shrink-0 tracking-tight">{{ comment.author.name }}</span>
            <span class="text-black/80 truncate tracking-tight">{{ comment.message }}</span>
          </div>

          <!-- Only when there are genuinely more comments than we're previewing -->
          <p
            v-if="hasMoreComments"
            class="text-xs font-black text-black/70 mt-0.5 tracking-wide"
          >
            View all {{ post.comment_count }} comments
          </p>
        </div>

        <!-- Empty-state nudge, only when there is nothing to preview -->
        <p
          v-else-if="post.enable_comments"
          @click="openComments"
          class="text-xs font-black text-black/70 uppercase tracking-widest cursor-pointer active:opacity-60"
        >
          Start the conversation
        </p>
      </div>
    </div>

    <!-- Reaction breakdown: per-emotion tally with proportion bars -->
    <BaseSheetModal
      :is-open="showReactionSheet"
      title="Reactions"
      :subtitle="`${totalReactionCount} total`"
      @close="showReactionSheet = false"
    >
      <div class="flex flex-col gap-3 pt-1">
        <div
          v-for="key in sortedReactions"
          :key="key"
          class="flex items-center gap-3.5"
        >
          <div class="w-12 h-12 rounded-2xl bg-white border border-black/5 shadow-sm flex items-center justify-center shrink-0">
            <img :src="reactionImages[key]" class="w-8 h-8 object-contain" alt="" />
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between mb-1.5">
              <span class="text-sm font-black text-black/80 tracking-tight">
                {{ reactionLabels[key] || key }}
              </span>
              <span class="text-sm font-black text-black/60 tracking-tight shrink-0 ml-2">
                {{ post.reaction_counts[key] }}
                <span class="text-black/40">· {{ reactionPercent(key) }}%</span>
              </span>
            </div>
            <div class="h-2 w-full rounded-full bg-black/5 overflow-hidden">
              <div
                class="h-full rounded-full bg-secondary transition-all duration-500"
                :style="{ width: reactionPercent(key) + '%' }"
              />
            </div>
          </div>
        </div>
      </div>
    </BaseSheetModal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onLongPress } from '@vueuse/core'
import { actionSheetController, alertController, IonIcon } from '@ionic/vue'
import {
  mdiChatOutline,
  mdiChevronRight,
  mdiDeleteOutline,
  mdiDotsHorizontal,
  mdiFlagVariantOutline,
  mdiHeartOutline,
  mdiPencilOutline,
  mdiSendOutline
} from '@mdi/js'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { svg } from '@/helper/general.helper'
import { FeedPost } from '@/types/server.types'
import { playSelectionTick, reactionImages, reactionLabels } from '@/config/post.config'
import { useMenuStore } from '@/store/menu.store'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { useUserContextSheet } from '@/composables/profile/useUserContextSheet'
import { Menu } from '@/draw/types/draw.types'
import { useModerationStore } from '@/store/moderation.store'

import UserAvatar from '@/components/profile/customization/UserAvatar.vue'
import ReactionBurst from '@/components/general/ReactionBurst.vue'
import BaseSheetModal from '@/components/general/BaseSheetModal.vue'
import {
  calculateSignatureStroke,
  hydrateCustomization,
  resolveFontEffectClass,
  resolveFontFamily,
  resolveTheme,
  resolveTitle
} from '@/config/profile_options.config'
import { useShareService } from '@/draw/store/useShareService.store'
import { mixpanelEvents, trackEvent } from '@/service/mixpanel'

dayjs.extend(relativeTime)

const props = defineProps<{ post: FeedPost; isMine: boolean }>()
const emit = defineEmits([
  'open-comments',
  'open-reaction-popover',
  'delete-post'
])

const { openUserActions } = useUserContextSheet()
const menuStore = useMenuStore()

const imageLoaded = ref(false)
const reactionSurface = ref<HTMLElement | null>(null)
const reactionBurst = ref<{ play: (r: string) => void } | null>(null)

const authorCustomization = computed(() =>
  hydrateCustomization(props.post.author?.customization)
)
const theme = computed(() => resolveTheme(authorCustomization.value.themeId))
const resolvedFontFamily = computed(() =>
  resolveFontFamily(authorCustomization.value.fontId)
)
const fontEffectClass = computed(() =>
  resolveFontEffectClass(authorCustomization.value.fontEffectId)
)
const displayTitle = computed(() =>
  resolveTitle(authorCustomization.value.titleId)
)
const signatureStrokeWidth = computed(() =>
  calculateSignatureStroke(authorCustomization.value.signatureViewBox)
)

const activeReactions = computed(() =>
  Object.keys(props.post.reaction_counts || {}).filter(
    (key) => props.post.reaction_counts[key] > 0
  )
)

const totalReactionCount = computed(() =>
  Object.values(props.post.reaction_counts || {}).reduce(
    (sum, count) => sum + count,
    0
  )
)

// Breakdown sheet: reactions ordered most-popular first.
const showReactionSheet = ref(false)
const sortedReactions = computed(() =>
  [...activeReactions.value].sort(
    (a, b) => props.post.reaction_counts[b] - props.post.reaction_counts[a]
  )
)
const reactionPercent = (key: string) => {
  const total = totalReactionCount.value
  if (!total) return 0
  return Math.round((props.post.reaction_counts[key] / total) * 100)
}

// Up to two embedded comments to preview inline.
const previewComments = computed(() => props.post.comments?.slice(0, 2) ?? [])

// "View all" should only appear when there are comments beyond what's previewed,
// i.e. genuinely hidden comments — never "View all 1 comments".
const hasMoreComments = computed(
  () => (props.post.comment_count ?? 0) > previewComments.value.length
)

watch(
  () => props.post.user_reaction,
  (newVal, oldVal) => {
    if (newVal && newVal !== oldVal) {
      reactionBurst.value?.play(newVal)
    }
  }
)

// Long-press anywhere on the artwork opens the reaction picker, mirroring
// the existing double-tap gesture. A light haptic confirms it armed.
onLongPress(
  reactionSurface,
  (e) => {
    playSelectionTick()
    emit('open-reaction-popover', { event: e, post: props.post })
  },
  { delay: 400, modifiers: { prevent: true } }
)

const openUser = (userId: string) => openUserActions({ _id: userId })
const shareService = useShareService()

const openShare = () => {
  trackEvent(mixpanelEvents.postShareOpen, {
    post_id: props.post._id,
    author_id: props.post.author._id,
    is_mine: props.isMine
  })
  shareService.setActiveShareItem({ type: 'post', data: props.post })
  menuStore.openMenu(Menu.SharePostMenu)
}

const openComments = () => {
  trackEvent(mixpanelEvents.postCommentsOpen, {
    post_id: props.post._id,
    author_id: props.post.author._id,
    comment_count: props.post.comment_count ?? 0
  })
  emit('open-comments', props.post)
}

const remixPost = async () => {
  const alert = await alertController.create({
    header: 'Start a remix?',
    message:
      'You\'ll leave this room and open a fresh canvas with this drawing.',
    cssClass: 'liquid-alert',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Let\'s draw',
        handler: () => {
          trackEvent(mixpanelEvents.postRemix, {
            post_id: props.post._id,
            author_id: props.post.author._id
          })
          setTimeout(() => {
            router.push({
              path: FRONTEND_ROUTES.draw,
              query: { canvas_url: props.post.drawing_url, mode: 'solo' }
            })
          }, 100)
        }
      }
    ]
  })
  await alert.present()
}

const handleDoubleTap = (e: MouseEvent | TouchEvent) => {
  e.preventDefault()
  emit('open-reaction-popover', { event: e, post: props.post })
}

const presentActionSheet = async () => {
  const buttons: any[] = [
    {
      text: 'Report Artwork',
      role: 'destructive',
      icon: svg(mdiFlagVariantOutline),
      handler: () => {
        useModerationStore().openReport({
          type: 'post',
          id: props.post._id,
          label: `${props.post.author.name}'s post`
        })
      }
    }
  ]
  if (props.isMine) {
    buttons.unshift({
      text: 'Delete Post',
      role: 'destructive',
      icon: svg(mdiDeleteOutline),
      handler: () => emit('delete-post', props.post)
    })
  }
  buttons.push({ text: 'Cancel', role: 'cancel' })

  const actionSheet = await actionSheetController.create({
    header: 'Post Options',
    cssClass: 'liquid-action-sheet',
    buttons
  })
  await actionSheet.present()
}
</script>
