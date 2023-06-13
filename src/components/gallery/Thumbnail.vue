<template>
  <div>
    <div class="z-10 absolute w-full h-full flex justify-center items-center" v-if="isLoading">
      <ion-spinner color="primary" />
    </div>
    <ion-img
      class="w-full cursor-pointer object-fill relative min-h-[150px]"
      :src="props.inboxItem.image"
      @ionImgDidLoad="isLoading = false"
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
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { IonAvatar, IonImg, IonSpinner } from '@ionic/vue'
import { InboxItem, User } from '@/types/server.types'
import { senderImg } from '@/helper/general.helper'

const props = defineProps<{
  inboxItem: InboxItem
  user: User
}>()

const isLoading = ref(true)
</script>

<style scoped>
ion-img::part(image) {
  border-radius: 10px;
}
</style>
