<template>
  <div ref="el" @click="emits('click')">
    <div class="z-10 absolute w-full h-full flex justify-center items-center" v-if="isLoading">
      <ion-spinner color="primary" />
    </div>
    <ion-img
      class="w-full cursor-pointer object-fill relative min-h-[150px]"
      :src="props.inboxItem.image"
      @ionImgDidLoad="isLoading = false"
      @contextmenu.prevent
    />
  </div>

  <div v-if="!isLoading">
    <div class="absolute z-10 right-1 top-1 w-3/12">
      <ion-avatar class="flex justify-center items-center w-full h-full"
        ><img :src="senderImg(user, props.inboxItem.sender)" alt="" class="aspect-square"
      /></ion-avatar>
    </div>

    <div
      v-if="props.inboxItem.comments.length > 0"
      class="absolute z-10 right-1 bottom-1 w-3/12 flex justify-center items-center rounded-full bg-secondary aspect-square text-md"
    >
      {{ props.inboxItem.comments.length }}
    </div>

    <div class="absolute z-10 left-1 top-1" v-if="multiSelectMode">
      <ion-icon
        size="large"
        :icon="
          svg(multiSelectedItems.includes(itemId) ? mdiCheckboxMarkedCircleOutline : mdiCheckboxBlankCircleOutline)
        "
        color="secondary"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue'
import { IonAvatar, IonImg, IonSpinner, IonIcon } from '@ionic/vue'
import { InboxItem, User } from '@/types/server.types'
import { isMobile, senderImg, svg } from '@/helper/general.helper'
import { onLongPress } from '@vueuse/core'
import { mdiCheckboxBlankCircleOutline, mdiCheckboxMarkedCircleOutline } from '@mdi/js'

const itemId = computed(() => props.inboxItem._id)

const props = defineProps<{
  inboxItem: InboxItem
  user: User
  multiSelectMode: boolean
  multiSelectedItems: string[]
}>()

const el = ref()

if (isMobile()) onLongPress(el, () => emits('long-press'), { modifiers: { prevent: true }, delay: 500 })

const emits = defineEmits(['long-press', 'click'])

const isLoading = ref(true)
</script>

<style scoped>
ion-img::part(image) {
  border-radius: 10px;
}
</style>
