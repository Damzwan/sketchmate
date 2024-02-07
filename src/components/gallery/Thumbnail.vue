<template>
  <div
    ref="el"
    @click="onClick"
    class="flex justify-center items-center rounded-2xl h-full w-full"
    @mouseover="emits('hover')"
  >
    <div class="relative w-full " :style="{ height: inboxItem.aspect_ratio ? `${renderHeight}px` : 'auto' }">
      <div
        class="z-10 absolute w-full h-full flex justify-center items-center rounded-2xl bg-primary border-[1px] border-secondary-light"
        v-if="isLoading">
        <ion-skeleton-text :animated="true" class="w-full h-full" />
      </div>

      <img
        :src="inboxItem.thumbnail"
        :alt="inboxItem.date"
        @contextmenu.prevent
        @load="isLoading = false"
        :loading="props.eager ? 'eager' : 'lazy' "
        class="w-full cursor-pointer relative object-contain rounded-2xl"
        :class="{'border-[1px] border-secondary-light': !isLoading}"
      />

      <div v-if="!isLoading">
        <div class="absolute z-10 right-1 top-1 cursor-pointer">

          <div class="flex -space-x-4">
            <img :src="senderImg(findUserInInboxUsers(follower))"
                 v-for="(follower, i) in [...inboxItem.followers].reverse().slice(0, badgesCountToShow)" :key="follower"
                 :alt="follower"
                 class="w-[32px] h-[32px] rounded-full border-secondary-light border-[1px] cursor-pointer"
                 :style="{'zIndex':  i}">

            <div
              class="w-[32px] h-[32px] rounded-full border-secondary-light border-[1px] flex justify-center items-center bg-white cursor-pointer"
              :style="{'zIndex':  inboxItem.followers.length + 1}"
              v-if="inboxItem.followers.slice(badgesCountToShow).length > 0">
              <p class="text-gray-600">{{ inboxItem.followers.slice(badgesCountToShow).length }}+</p>
            </div>
          </div>
        </div>

        <div class="absolute z-10 left-0 top-0 w-3 h-3 bg-secondary rounded-full" v-if="isNew" />
        <div
          v-if="props.inboxItem.comments.length > 0"
          class="absolute z-10 right-1 bottom-1 w-[32px] flex justify-center items-center rounded-full bg-secondary aspect-square text-md cursor-pointer"
        >
          <div class="absolute z-10 left-0 top-0 w-2 h-2 bg-blue-400 rounded-full" v-if="isNewComment" />

          {{ props.inboxItem.comments.length }}
        </div>

        <div class="absolute z-10 left-1 top-1 w-[24px] h-[24px]" v-if="multiSelectMode">
          <ion-icon
            size="large"
            :icon="
              svg(multiSelectedItems.includes(itemId) ? mdiCheckboxMarkedCircleOutline : mdiCheckboxBlankCircleOutline)
            "
            color="secondary"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { IonIcon, IonSkeletonText } from '@ionic/vue'
import { InboxItem, User } from '@/types/server.types'
import { isMobile, senderImg, svg } from '@/helper/general.helper'
import { onLongPress } from '@vueuse/core'
import { mdiCheckboxBlankCircleOutline, mdiCheckboxMarkedCircleOutline } from '@mdi/js'
import { useAppStore } from '@/store/app.store'

const itemId = computed(() => props.inboxItem._id)
let cancelClick = false
const renderHeight = ref(100)

const badgesCountToShow = 2
const { findUserInInboxUsers } = useAppStore()

let resizeObserver
onMounted(async () => {
  resizeObserver = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width } = entry.contentRect
      if (!props.inboxItem.aspect_ratio) return
      renderHeight.value = width / props.inboxItem.aspect_ratio
    }
  })

  if (el.value) resizeObserver.observe(el.value)
})

function onClick() {
  if (cancelClick) cancelClick = false
  else emits('click')
}

const props = defineProps<{
  inboxItem: InboxItem
  user: User
  multiSelectMode: boolean
  multiSelectedItems: string[]
  eager: boolean
}>()

const el = ref()

onLongPress(
  el,
  () => {
    if (!isMobile()) cancelClick = true
    emits('long-press')
  },
  { modifiers: { prevent: true }, delay: 500 }
)

const emits = defineEmits(['long-press', 'click', 'hover'])

const isNew = computed(() => !props.inboxItem.seen_by.includes(props.user._id))
const isNewComment = computed(() => !props.inboxItem.comments_seen_by.includes(props.user._id))

const isLoading = ref(true)
</script>

<style scoped>
ion-img::part(image) {
  border-radius: 10px;
}
</style>
