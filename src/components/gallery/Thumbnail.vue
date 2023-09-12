<template>
  <div ref="el" @click="onClick" class="flex justify-center items-center rounded-2xl h-full w-full">
    <div class="relative w-full" :style="{ height: inboxItem.aspect_ratio ? `${renderHeight}px` : 'auto' }">
      <div class="z-10 absolute w-full h-full flex justify-center items-center" v-if="isLoading">
        <ion-spinner color="primary" />
      </div>

      <img
        :src="inboxItem.thumbnail"
        :alt="inboxItem.date"
        @contextmenu.prevent
        @load="isLoading = false"
        class="w-full cursor-pointer relative object-contain rounded-2xl"
        :class="{ 'border-[1px] border-secondary-light': !isLoading }"
      />

      <div v-if="!isLoading">
        <div class="absolute z-10 right-1 top-1 w-[24px]">
          <ion-avatar class="flex justify-center items-center w-full h-full"
            ><img :src="senderImg(user, props.inboxItem.sender)" alt="" class="aspect-square"
          /></ion-avatar>
        </div>

        <div class="absolute z-10 left-0 top-0 w-3 h-3 bg-secondary rounded-full" v-if="isNew">
          <span
            class="animate-ping-slow absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"
          ></span>
        </div>
        <div
          v-if="props.inboxItem.comments.length > 0"
          class="absolute z-10 right-1 bottom-1 w-[24px] flex justify-center items-center rounded-full bg-secondary aspect-square text-md"
        >
          <span
            class="animate-ping-slow absolute w-5/6 h-5/6 -z-10 rounded-full bg-secondary opacity-75"
            v-if="isNewComment"
          />
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
import { IonAvatar, IonSpinner, IonIcon } from '@ionic/vue'
import { InboxItem, User } from '@/types/server.types'
import { isMobile, senderImg, svg } from '@/helper/general.helper'
import { onLongPress } from '@vueuse/core'
import { mdiCheckboxBlankCircleOutline, mdiCheckboxMarkedCircleOutline } from '@mdi/js'

const itemId = computed(() => props.inboxItem._id)
let cancelClick = false
const renderHeight = ref(100)

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

const emits = defineEmits(['long-press', 'click'])

const isNew = computed(() => !props.inboxItem.seen_by.includes(props.user._id))
const isNewComment = computed(() => !props.inboxItem.comments_seen_by.includes(props.user._id))

const isLoading = ref(true)
</script>

<style scoped>
ion-img::part(image) {
  border-radius: 10px;
}
</style>
