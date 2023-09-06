<template>
  <div ref="el" @click="onClick" class="relative h-full">
    <div class="z-10 absolute w-full h-full flex justify-center items-center" v-if="isLoading">
      <ion-spinner color="primary" />
    </div>

    <img
      :src="props.inboxItem.thumbnail"
      :alt="props.inboxItem.date"
      @contextmenu.prevent
      @load="isLoading = false"
      class="w-full cursor-pointer relative min-h-[150px] h-full object-fill rounded-xl"
    />

    <div v-if="!isLoading">
      <div class="absolute z-10 right-0.5 top-0.5 w-[28px]">
        <ion-avatar class="flex justify-center items-center w-full h-full"
          ><img :src="senderImg(user, props.inboxItem.sender)" alt="" class="aspect-square"
        /></ion-avatar>
      </div>

      <div
        v-if="props.inboxItem.comments.length > 0"
        class="absolute z-10 right-0.5 bottom-0.5 w-[28px] flex justify-center items-center rounded-full bg-secondary aspect-square text-md"
      >
        {{ props.inboxItem.comments.length }}
      </div>

      <div class="absolute z-10 left-0.5 top-0.5 w-[28px]" v-if="multiSelectMode">
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
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { IonAvatar, IonSpinner, IonIcon } from '@ionic/vue'
import { InboxItem, User } from '@/types/server.types'
import { isMobile, senderImg, svg } from '@/helper/general.helper'
import { onLongPress } from '@vueuse/core'
import { mdiCheckboxBlankCircleOutline, mdiCheckboxMarkedCircleOutline } from '@mdi/js'

const itemId = computed(() => props.inboxItem._id)
let cancelClick = false

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

const isLoading = ref(true)
</script>

<style scoped>
ion-img::part(image) {
  border-radius: 10px;
}
</style>
