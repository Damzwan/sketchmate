<template>
  <div
    ref="el"
    @click="onClick"
    class="relative flex justify-center items-center h-full w-full select-none touch-pan-y"
    @mouseover="emits('hover')"
  >
    <!-- Scale transition isolated to this div to prevent layout jitter -->
    <div
      class="relative w-full overflow-hidden rounded-2xl will-change-transform transition-transform duration-200 ease-out"
      :class="[
        multiSelectedItems.includes(itemId) ? 'scale-[0.94]' : 'scale-100'
      ]"
      :style="{ height: inboxItem.aspect_ratio ? `${renderHeight}px` : 'auto' }"
    >
      <!-- Background / Border Layer -->
      <div
        class="absolute inset-0 rounded-2xl transition-all duration-300"
        :class="[
          multiSelectedItems.includes(itemId) ? 'ring-2 ring-secondary ring-offset-2' : 'ring-0 shadow-sm'
        ]"
      />

      <!-- Loading State -->
      <div
        class="z-10 absolute inset-0 flex justify-center items-center rounded-2xl bg-primary border border-secondary-light/30"
        v-if="isLoading">
        <ion-skeleton-text :animated="true" class="w-full h-full m-0" />
      </div>

      <!-- Main Image -->
      <img
        :src="inboxItem.thumbnail"
        :alt="inboxItem.date"
        @contextmenu.prevent
        @load="isLoading = false"
        :loading="props.eager ? 'eager' : 'lazy'"
        class="w-full h-full relative object-contain rounded-2xl pointer-events-none transition-opacity duration-300"
        :class="[
          { 'border border-secondary-light/20': !isLoading },
          multiSelectedItems.includes(itemId) ? 'opacity-80' : 'opacity-100'
        ]"
      />

      <!-- Overlay Layer -->
      <div v-if="!isLoading" class="absolute inset-0 pointer-events-none">

        <!-- Selection Checkmark (Top Left) -->
        <div
          v-if="multiSelectMode"
          class="absolute z-30 left-2 top-2 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 shadow-sm"
          :class="multiSelectedItems.includes(itemId) ? 'bg-secondary scale-110' : 'bg-white/40 backdrop-blur-md scale-100'"
        >
          <ion-icon
            :icon="svg(multiSelectedItems.includes(itemId) ? mdiCheckboxMarkedCircleOutline : mdiCheckboxBlankCircleOutline)"
            :class="multiSelectedItems.includes(itemId) ? 'text-white' : 'text-gray-500'"
            class="text-[22px]"
          />
        </div>

        <!-- Collaborative Badges (Top Right) -->
        <div class="absolute z-20 right-2 top-2 flex -space-x-3 pointer-events-auto">
          <img
            v-for="(follower, i) in [...inboxItem.followers].reverse().slice(0, badgesCountToShow)"
            :key="follower"
            :src="senderImg(findUserInInboxUsers(follower))"
            class="w-8 h-8 rounded-full border-2 border-white shadow-sm object-cover"
            :style="{ zIndex: i }"
          >
          <div
            v-if="inboxItem.followers.length > badgesCountToShow"
            class="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex justify-center items-center shadow-sm"
          >
            <span class="text-[10px] font-bold text-gray-600">
              +{{ inboxItem.followers.length - badgesCountToShow }}
            </span>
          </div>
        </div>

        <!-- New Item Indicator -->
        <div class="absolute z-20 left-0 top-0 w-3 h-3 bg-secondary rounded-full border-2 border-white" v-if="isNew" />

        <!-- Comments Badge (Bottom Right) -->
        <div
          v-if="props.inboxItem.comments.length > 0"
          class="absolute z-20 right-2 bottom-2 px-2.5 py-1 flex items-center gap-1.5 rounded-full bg-secondary text-white shadow-lg pointer-events-auto transition-transform active:scale-95"
        >
          <div class="w-1.5 h-1.5 bg-blue-300 rounded-full" v-if="isNewComment" />
          <span class="text-[11px] font-bold leading-none">{{ props.inboxItem.comments.length }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, onUnmounted, watch } from 'vue'
import { IonIcon, IonSkeletonText } from '@ionic/vue'
import { InboxItem, User } from '@/types/server.types'
import { isMobile, senderImg, svg } from '@/helper/general.helper'
import { onLongPress } from '@vueuse/core'
import { mdiCheckboxBlankCircleOutline, mdiCheckboxMarkedCircleOutline } from '@mdi/js'
import { useInboxStore } from '@/store/inbox.store'
import { Haptics, ImpactStyle } from '@capacitor/haptics'

const props = defineProps<{
  inboxItem: InboxItem
  user: User
  multiSelectMode: boolean
  multiSelectedItems: string[]
  eager: boolean
}>()

const emits = defineEmits(['long-press', 'click', 'hover'])

const itemId = computed(() => props.inboxItem._id)

// Haptics selection watch
watch(() => props.multiSelectedItems.includes(itemId.value), (isSelected, oldVal) => {
  if (props.multiSelectMode && oldVal !== undefined) {
    Haptics.impact({ style: isSelected ? ImpactStyle.Medium : ImpactStyle.Light })
  }
})

const el = ref<HTMLElement | null>(null)
const renderHeight = ref(100)
const isLoading = ref(true)
const badgesCountToShow = 2
const { findUserInInboxUsers } = useInboxStore()

let cancelClick = false
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      if (!props.inboxItem.aspect_ratio) return
      renderHeight.value = entry.contentRect.width / props.inboxItem.aspect_ratio
    }
  })
  if (el.value) resizeObserver.observe(el.value)
})

onUnmounted(() => resizeObserver?.disconnect())

async function onClick() {
  if (cancelClick) {
    cancelClick = false
    return
  }
  await Haptics.impact({ style: ImpactStyle.Light })
  emits('click')
}

onLongPress(
  el,
  async () => {
    if (!isMobile()) cancelClick = true
    await Haptics.impact({ style: ImpactStyle.Heavy })
    emits('long-press')
  },
  {
    modifiers: { prevent: true },
    delay: 500
  }
)

const isNew = computed(() => !props.inboxItem.seen_by.includes(props.user._id))
const isNewComment = computed(() => !props.inboxItem.comments_seen_by.includes(props.user._id))
</script>

<style scoped>
* {
  -webkit-touch-callout: none !important;
  -webkit-user-select: none !important;
  -webkit-tap-highlight-color: transparent !important;
  user-select: none !important;
}

.touch-pan-y {
  touch-action: pan-y;
}

img {
  -webkit-user-drag: none;
  pointer-events: none;
}
</style>