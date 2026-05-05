<template>
  <section class="min-h-[300px] cabin-sketch-regular pb-10 max-w-2xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 mb-6">
      <h2 class="text-2xl font-black text-black tracking-tight italic drop-shadow-sm">Community Vibes</h2>
      <button
        @click="loadFeed"
        class="p-2 rounded-2xl bg-primary/40 backdrop-blur-md border border-primary/60 shadow-lg active:scale-75 transition-transform"
        :class="{ 'animate-spin': isRefreshing }"
      >
        <span class="text-lg drop-shadow-md">🌀</span>
      </button>
    </div>

    <transition name="fade-slow" mode="out-in">
      <div v-if="loading" key="loading" class="space-y-8 px-4">
        <div v-for="i in 2" :key="i"
             class="h-[400px] bg-primary/40 rounded-[2.5rem] animate-pulse border border-primary/60" />
      </div>

      <div v-else key="data" class="space-y-12 px-4">
        <div v-for="(post, index) in posts" :key="post._id" class="relative group w-full">
          <!-- Floating Description -->
          <div v-if="post.description" class="absolute -top-5 right-2 z-20 pointer-events-none transform rotate-3">
            <div
              class="inline-block bg-white/90 backdrop-blur-md border border-white/80 px-4 py-2 rounded-2xl shadow-xl">
              <p class="text-sm font-bold text-black italic line-clamp-2 leading-snug">"{{ post.description }}"</p>
            </div>
          </div>

          <!-- Main Card Wrapper -->
          <div
            class="bg-primary/60 backdrop-blur-xl rounded-[2.5rem] border border-secondary/20 shadow-xl overflow-hidden">
            <!-- Post Header -->
            <div class="flex items-center p-3 z-10 relative bg-white/10 border-b border-primary/30">
              <div
                class="w-10 h-10 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-sm flex items-center justify-center overflow-hidden">
                <img v-if="post.author.img" :src="post.author.img" class="w-full h-full object-cover" />
                <span v-else class="text-black font-bold">{{ post.author.name.charAt(0) }}</span>
              </div>
              <div class="flex-1 ml-3">
                <p class="text-base leading-none font-bold text-black drop-shadow-sm">{{ post.author.name }}</p>
                <p class="text-[10px] text-black/60 font-bold uppercase mt-1">{{ dayjs(post.createdAt).fromNow() }}</p>
              </div>
              <button @click.stop="presentActionSheet(post)" class="p-2 active:scale-90 transition-transform">
                <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-2xl text-black/50" />
              </button>
            </div>

            <!-- Canvas Area -->
            <div
              class="canvas-area relative w-full flex items-center justify-center bg-black/5"
              :style="{ aspectRatio: post.aspect_ratio || 1 }"
              @click="(e) => handleCanvasClick(e, post, index)"
            >
              <img :src="post.image_url"
                   class="absolute inset-0 w-full h-full object-cover blur-2xl opacity-30 scale-110 pointer-events-none" />
              <img
                :src="post.image_url"
                class="w-full h-full object-contain relative z-10 transition-all duration-500"
                :class="imageLoaded[post._id] ? 'opacity-100 scale-100' : 'opacity-0 scale-95'"
                @load="imageLoaded[post._id] = true"
              />

              <!-- Compact Reaction Stack (Bottom Left) -->
              <button @click.stop="(e) => openReactionPopover(e, post)"
                      class="absolute bottom-3 left-3 flex items-center z-20 active:scale-95 transition-transform">
                <div class="flex -space-x-2 mr-2">
                  <img v-if="getActiveReactions(post).length === 0" :src="reactionImages.heart"
                       class="w-8 h-8 object-contain drop-shadow-md" />
                  <img v-else v-for="type in getActiveReactions(post)" :key="type" :src="reactionImages[type]"
                       class="w-8 h-8 object-contain drop-shadow-md" />
                </div>
                <div v-if="getTotalReactions(post.reaction_counts) > 0"
                     class="bg-white/40 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/50 text-xs font-black">
                  {{ getTotalReactions(post.reaction_counts) }}
                </div>
              </button>

              <!-- Comment Bubble (Bottom Right) -->
              <button v-if="post.comments?.length" @click.stop="openPostSwiper(posts, index)"
                      class="absolute bottom-3 right-3 bg-white/80 backdrop-blur-md border border-white/80 rounded-2xl shadow-lg flex items-center space-x-2 px-3 py-1.5 active:scale-95 transition-transform max-w-[60%] z-20">
                <img :src="post.comments[0].author.img"
                     class="w-5 h-5 rounded-full border border-primary/20 object-cover" />
                <span
                  class="text-[11px] font-bold italic text-black/80 truncate leading-tight">{{ post.comments[0].message
                  }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <ion-popover
      :is-open="popoverOpen"
      :event="popoverEvent"
      @didDismiss="popoverOpen = false"
      :show-backdrop="false"
      class="liquid-popover"
      side="top"
      :arrow="false"
      alignment="center"
    >
      <div class="liquid-glass-inner flex items-center px-4 py-4 space-x-3 animate-pop-in isolate">
        <button
          v-for="(imgSrc, type) in reactionImages"
          :key="type"
          @click="selectReaction(type)"
          class="group relative w-12 h-12 p-1 transition-all duration-300 hover:scale-125 active:scale-95"
        >
          <img
            :src="imgSrc"
            class="h-full w-full object-contain drop-shadow-md transition-transform duration-300 group-hover:-translate-y-2"
          />
          <div
            v-if="activePopoverPost?.user_reaction === type"
            class="absolute -bottom-2 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-black/40 shadow-sm"
          />
        </button>
      </div>
    </ion-popover>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { actionSheetController, IonIcon, IonPopover } from '@ionic/vue'
import { mdiDotsHorizontal, mdiFlagVariantOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { useAuthStore } from '@/store/auth.store'
import { usePostStore } from '@/store/post.store' // New import
import { storeToRefs } from 'pinia'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { usePostSwiper } from '@/composables/home/usePostSwiper'
import { FeedPost } from '@/types/server.types'
import { reactionImages } from '@/config/post.config'

dayjs.extend(relativeTime)

// --- STORE LOGIC ---
const authStore = useAuthStore()
const postStore = usePostStore()
const { user } = storeToRefs(authStore)
const { feedPosts: posts, isFeedDirty } = storeToRefs(postStore)
const { openPostSwiper } = usePostSwiper()

const loading = ref(true)
const isRefreshing = ref(false)
const imageLoaded = ref<Record<string, boolean>>({})

const loadFeed = async () => {
  if (!user.value) return
  isRefreshing.value = !loading.value
  try {
    await postStore.getFeed()
  } finally {
    loading.value = false
    isRefreshing.value = false
  }
}

const toggleReaction = async (post: FeedPost, type: string) => {
  try {
    await postStore.toggleReactionLocally(post._id, type)
  } catch (e) {
    console.error('Reaction sync failed', e)
  }
}

// --- Interaction Logic (Keep as is) ---
let clickTimer: ReturnType<typeof setTimeout> | null = null
const popoverOpen = ref(false)
const popoverEvent = ref<Event | null>(null)
const activePopoverPost = ref<FeedPost | null>(null)

const handleCanvasClick = (e: MouseEvent | TouchEvent, post: FeedPost, index: number) => {
  if (clickTimer) {
    clearTimeout(clickTimer)
    clickTimer = null
    openReactionPopover(e, post)
  } else {
    clickTimer = setTimeout(() => {
      clickTimer = null
      openPostSwiper(posts.value, index)
    }, 180)
  }
}

const openReactionPopover = (e: any, post: FeedPost) => {
  activePopoverPost.value = post
  const x = e.clientX || (e.touches && e.touches[0].clientX)
  const y = e.clientY || (e.touches && e.touches[0].clientY)
  popoverEvent.value = {
    target: {
      getBoundingClientRect: () => ({
        left: x,
        top: y,
        right: x,
        bottom: y,
        width: 0,
        height: 0
      })
    }
  } as any
  popoverOpen.value = true
}

const selectReaction = async (type: string) => {
  popoverOpen.value = false
  if (activePopoverPost.value) {
    await toggleReaction(activePopoverPost.value, type)
  }
}

const getActiveReactions = (post: FeedPost) => {
  if (!post.reaction_counts) return []
  return Object.keys(post.reaction_counts).filter(key => post.reaction_counts[key] > 0).slice(0, 3)
}

const getTotalReactions = (counts: Record<string, number>) => Object.values(counts || {}).reduce((a, b) => a + b, 0)

const presentActionSheet = async (post: FeedPost) => {
  const actionSheet = await actionSheetController.create({
    header: 'Post Options',
    cssClass: 'liquid-action-sheet',
    buttons: [
      {
        text: 'Report Sketch',
        role: 'destructive',
        icon: svg(mdiFlagVariantOutline),
        handler: () => console.log('Reported:', post._id)
      },
      { text: 'Cancel', role: 'cancel' }
    ]
  })
  await actionSheet.present()
}

watch(user, (newVal) => {
  if (newVal) {
    // Initial load OR refresh if dirty
    if (posts.value.length === 0 || isFeedDirty.value) {
      loadFeed()
    } else {
      loading.value = false // Already has data
    }
  }
}, { immediate: true })


</script>

<style scoped>
@reference "@/theme/main.css";

ion-popover.liquid-popover {
  --background: transparent;
  --box-shadow: none;
  --width: auto;
  --offset-y: -20px;
  overflow: visible;
}

ion-popover.liquid-popover::part(content) {
  background: rgba(var(--ion-color-tertiary-rgb, 250, 224, 194), 0.8);
  box-shadow: none;
  overflow: visible;
  border-radius: 2.5rem;
}

.liquid-glass-inner {
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border: 1px solid rgba(0, 0, 0, 0.05);
  border-radius: 2.5rem;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
  position: relative;
}

/* 3. Playful Entrance Animation */
@keyframes popIn {
  0% {
    opacity: 0;
    transform: scale(0.6) translateY(20px);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-pop-in {
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}

.canvas-area {
  max-height: 50vh;
}
</style>

<style>
.liquid-action-sheet {
  --background: rgba(var(--ion-color-tertiary-rgb, 250, 224, 194), 0.4);
  --backdrop-opacity: 0;
}

.liquid-action-sheet .action-sheet-wrapper {
  backdrop-filter: blur(24px) saturate(150%);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  border-radius: 32px 32px 0 0;
  box-shadow: 0 -15px 40px rgba(0, 0, 0, 0.05);
}

.liquid-action-sheet .action-sheet-title {
  font-family: 'Cabin Sketch', cursive;
  font-weight: bold;
  color: rgba(var(--ion-color-dark-rgb, 0, 0, 0), 0.7);
  font-size: 1.1rem;
}

.liquid-action-sheet .action-sheet-button {
  background: transparent;
  color: var(--ion-color-dark);
  font-weight: bold;
}
</style>