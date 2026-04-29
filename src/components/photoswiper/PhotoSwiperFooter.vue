<template>
  <div class="flex justify-evenly w-full items-center h-14 relative">

    <div
      v-if="currItem && showComments && (currItem.comments || []).length > 0"
      @click="$emit('open-comments')"
      class="comments cursor-pointer"
    >
      <div
        v-for="(comment, i) in (currItem.comments || []).slice(0, 4)"
        :key="i"
        class="rounded-full comment my-1 p-1"
      >
        <div class="flex items-center pl-1">
          <ion-avatar class="flex justify-center items-center w-[30px] h-[30px]">
            <img :src="senderImg(resolveUser(comment.sender))" alt="" class="aspect-square" />
          </ion-avatar>
          <div class="flex-1 mx-2">
            <div class="text-sm font-bold text-white cabin-sketch-regular">
              {{ senderName(resolveUser(comment.sender)) }}
            </div>
            <div class="text-sm text-white cabin-sketch-regular">{{ comment.message }}</div>
          </div>
        </div>
      </div>

      <div v-if="(currItem.comments || []).length > 4" class="rounded-full comment my-1">
        <p class="text-sm text-white py-1 pl-2 cabin-sketch-regular">
          Click to see {{ (currItem.comments || []).length - 4 }} more comments
        </p>
      </div>
    </div>

    <ion-button v-if="canReply" fill="clear" color="light" @click="$emit('reply')" class="grow" size="large">
      <ion-icon :icon="svg(mdiReplyOutline)" />
    </ion-button>

    <ion-button
      v-if="currItem.comments"
      fill="clear"
      color="light"
      @click="$emit('open-comments')"
      class="flex-grow relative"
      size="large"
    >
      <ion-icon :icon="svg(mdiCommentOutline)" />
      <ion-badge
        v-if="currItem.comments.length > 0"
        class="mb-[25px] absolute ml-[35px]"
        color="secondary"
      >
        {{ currItem.comments.length }}
      </ion-badge>
    </ion-button>

    <ion-button fill="clear" color="light" @click="handleShare" class="flex-grow" size="large">
      <ion-icon :icon="svg(mdiShareVariantOutline)" />
    </ion-button>

    <ion-button v-if="canDelete" fill="clear" color="light" id="delete-swiper-item" class="flex-grow" size="large">
      <ConfirmationAlert
        header="Are you sure?"
        trigger="delete-swiper-item"
        message="This drawing will be deleted permanently"
        @confirm="$emit('delete')"
      />
      <ion-icon :icon="svg(mdiDeleteOutline)" />
    </ion-button>

  </div>
</template>

<script setup lang="ts">
import { IonAvatar, IonBadge, IonButton, IonIcon } from '@ionic/vue'
import {
  mdiReplyOutline,
  mdiCommentOutline,
  mdiShareVariantOutline,
  mdiDeleteOutline
} from '@mdi/js'
import { svg, senderImg, senderName } from '@/helper/general.helper'
import { shareImg } from '@/helper/share.helper'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'

const props = defineProps<{
  currItem: any
  showComments: boolean
  canReply: boolean | undefined
  canDelete: boolean
  userLookup?: (userId: string) => any
}>()

defineEmits(['open-comments', 'reply', 'delete'])

function resolveUser(userId: string) {
  return props.userLookup ? props.userLookup(userId) : userId
}

function handleShare() {
  if (props.currItem && props.currItem.image) {
    shareImg(props.currItem.image)
  }
}
</script>

<style scoped>
.comments {
  position: absolute;
  right: 0;
  bottom: 60px;
  z-index: 100;
  width: 250px;
  padding: 10px;
}
.comment {
  background-color: rgba(0, 0, 0, 0.6) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(4px); /* Optional: Adds a nice modern touch to the floating comments */
}
</style>