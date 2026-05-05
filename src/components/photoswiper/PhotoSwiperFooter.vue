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
            <!-- Prioritize hydrated author, fallback to resolver -->
            <img :src="comment.author?.img || senderImg(resolveUser(comment.sender || comment.author_id))" alt=""
                 class="aspect-square" />
          </ion-avatar>
          <div class="flex-1 mx-2">
            <div class="text-sm font-bold text-white cabin-sketch-regular">
              {{ comment.author?.name || senderName(resolveUser(comment.sender || comment.author_id)) }}
            </div>
            <!-- Added truncate to prevent long comments from breaking the preview bubble -->
            <div class="text-sm text-white cabin-sketch-regular truncate">{{ comment.message }}</div>
          </div>
        </div>
      </div>

      <div v-if="(currItem.comments || []).length > 4" class="rounded-full comment my-1">
        <p class="text-sm text-white py-1 pl-2 cabin-sketch-regular">
          Click to see {{ currItem.comments.length - 4 }} more comments
        </p>
      </div>
    </div>

    <!-- Floating Preview Comments (Only works if comments array exists) -->
    <div
      v-if="currItem && showComments && (currItem.comments || []).length > 0"
      @click="$emit('open-comments')"
      class="comments cursor-pointer"
    >
      <!-- ... your existing floating comment loop ... -->
    </div>

    <!-- 1. SOCIAL REACTIONS (Only for Public Posts) -->
    <ion-button v-if="isPost" fill="clear" color="light" @click="$emit('react')" class="grow" size="large">
      <div class="relative flex items-center justify-center">
        <span class="text-2xl" :class="{ 'filter grayscale-[0.5]': !userHasReacted }">❤️</span>
        <ion-badge v-if="totalReactions > 0" class="mb-[25px] absolute ml-[35px]" color="secondary">
          {{ totalReactions }}
        </ion-badge>
      </div>
    </ion-button>

    <!-- 2. REPLY BUTTON -->
    <ion-button v-if="canReply" fill="clear" color="light" @click="$emit('reply')" class="grow" size="large">
      <ion-icon :icon="svg(mdiReplyOutline)" />
    </ion-button>

    <!-- 3. COMMENTS BUTTON (Uses generalized commentCount) -->
    <ion-button
      fill="clear"
      color="light"
      @click="$emit('open-comments')"
      class="flex-grow relative"
      size="large"
    >
      <ion-icon :icon="svg(mdiCommentOutline)" />
      <ion-badge
        v-if="displayCommentCount > 0"
        class="mb-[25px] absolute ml-[35px]"
        color="secondary"
      >
        {{ displayCommentCount }}
      </ion-badge>
    </ion-button>

    <!-- 4. SHARE BUTTON -->
    <ion-button fill="clear" color="light" @click="handleShare" class="flex-grow" size="large">
      <ion-icon :icon="svg(mdiShareVariantOutline)" />
    </ion-button>

    <!-- 5. DELETE BUTTON -->
    <ion-button v-if="canDelete" fill="clear" color="light" id="delete-swiper-item" class="flex-grow" size="large">
      <!-- ... your existing delete alert ... -->
    </ion-button>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonBadge, IonButton, IonIcon } from '@ionic/vue'
import { mdiCommentOutline, mdiReplyOutline, mdiShareVariantOutline } from '@mdi/js'
import { senderImg, senderName, svg } from '@/helper/general.helper'
import { shareImg } from '@/helper/share.helper'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'

const props = defineProps<{
  currItem: any
  showComments: boolean
  canReply: boolean | undefined
  canDelete: boolean
  userLookup?: (userId: string) => any
}>()


// Generalized Comment Count
const displayCommentCount = computed(() => {
  if (isPost.value) return props.currItem.comment_count || 0
  return props.currItem.comments?.length || 0
})
const emit = defineEmits(['open-comments', 'reply', 'delete', 'react'])
const { user } = storeToRefs(useAuthStore())

// Logic to determine if this is a Public Post or Private InboxItem
const isPost = computed(() => !!props.currItem.author_id)

const totalReactions = computed(() => {
  if (!props.currItem.reactions) return 0
  return Object.values(props.currItem.reactions).reduce((sum: number, arr: any) => sum + (arr?.length || 0), 0)
})

const userHasReacted = computed(() => {
  if (!props.currItem.reactions || !user.value) return false
  return Object.values(props.currItem.reactions).some((uids: any) => uids.includes(user.value!._id))
})

function resolveUser(userId: string) {
  return props.userLookup ? props.userLookup(userId) : userId
}

function handleShare() {
  // Support both image (Private) and image_url (Public)
  const imgUrl = props.currItem.image_url || props.currItem.image
  if (imgUrl) {
    shareImg(imgUrl)
  }
}
</script>

<style scoped>
/* Floating comments styles remain same */
.comments {
  position: absolute;
  right: 0;
  bottom: 60px;
  z-index: 100;
  width: 250px;
  padding: 10px;
  pointer-events: none; /* Prevents blocking swiper interaction */
}

.comment {
  pointer-events: auto;
  background-color: rgba(0, 0, 0, 0.6) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
  backdrop-filter: blur(4px);
}
</style>