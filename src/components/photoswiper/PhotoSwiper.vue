<template>
  <transition name="expand">
    <div class="fixed w-full h-full bg-black z-50 flex flex-col safe-area" v-show="open" v-if="user">
      <ion-toolbar class="w-full h-14 flex">
        <ion-buttons slot="start">
          <ion-button @click="close" color="light">
            <ion-icon :icon="arrowBack" />
          </ion-button>
        </ion-buttons>

        <ion-buttons slot="end">
          <ion-button
            @click="showComments = !showComments"
            color="light"
            class="pr-2"
            v-if="currInboxItem.comments.length > 0"
          >
            <ion-icon :icon="svg(showComments ? mdiChatRemoveOutline : mdiChatOutline)" class="w-[25px] h-[25px]" />
          </ion-button>

          <button class="flex -space-x-6" @click="isFollowerDrawerOpen=true">
            <img :src="senderImg(findUserInInboxUsers(follower))"
                 v-for="(follower, i) in [...currInboxItem.followers].reverse().slice(0, badgesCountToShow)"
                 :key="follower"
                 :alt="follower" class="w-[36px] h-[36px] rounded-full border-secondary-light border-[1px]"
                 :style="{'zIndex':  i}">

            <div
              class="w-[36px] h-[36px] rounded-full border-secondary-light border-[1px] flex justify-center items-center bg-white"
              :style="{'zIndex':  currInboxItem.followers.length + 1}"
              v-if="currInboxItem.followers.slice(badgesCountToShow).length > 0">
              <p class="text-gray-600">{{ currInboxItem.followers.slice(badgesCountToShow).length }}+</p>
            </div>
          </button>
        </ion-buttons>
      </ion-toolbar>

      <swiper-container
        class="w-full grow"
        :slides-per-view="1"
        keyboard-enabled="true"
        @swiperslidechange="(x: any) => slide = x.target.swiper.activeIndex"
        :initial-slide="slide"
        lazyPreloadPrevNext="3"
        :zoom="{maxRatio: 3}"
        ref="swiper"
        @update="() => swiper.swiper.slideTo(slide + 1, 0)"
      >
        <swiper-slide v-for="(item, i) in inbox" :key="i">
          <div class="swiper-zoom-container"
               v-if="Math.abs(slide - i) < 3">
            <PhotoSwiperItem :thumbnail="item.thumbnail" :image="item.image"
                             :switch-to-image="Math.abs(slide - i) < 3" />
          </div>
        </swiper-slide>
      </swiper-container>


      <div class="flex justify-evenly w-full items-center h-14 relative">
        <div v-if="currInboxItem && showComments" @click="isCommentDrawerOpen = true" class="comments cursor-pointer">
          <div v-for="(comment, i) in currInboxItem.comments.slice(0, 4)" :key="i"
               class="rounded-full comment my-1 p-1">
            <div class="flex items-center pl-1">
              <ion-avatar class="flex justify-center items-center w-[30px] h-[30px]"
              ><img :src="senderImg(findUserInInboxUsers(comment.sender))" alt="" class="aspect-square"
              /></ion-avatar>
              <div class="flex-1 mx-2">
                <div class="text-sm font-bold text-white cabin-sketch-regular">
                  {{ senderName(findUserInInboxUsers(comment.sender)) }}
                </div>
                <div class="text-sm text-white cabin-sketch-regular">{{ comment.message }}</div>
              </div>
            </div>
          </div>
          <div v-if="currInboxItem.comments.length > 4" class="rounded-full comment my-1">
            <p class="text-sm text-white py-1 pl-2 cabin-sketch-regular">{{
                `Click to see ${currInboxItem.comments.length - 4} more comments`
              }}</p>
          </div>
        </div>



        <ion-button fill="clear" color="light" @click="replyToDrawing" class="grow" size="large">
          <ion-icon :icon="svg(mdiReplyOutline)" />
        </ion-button>

        <ion-button
          fill="clear"
          color="light"
          @click="() => (isCommentDrawerOpen = true)"
          class="flex-grow"
          size="large"
        >
          <ion-icon :icon="svg(mdiCommentOutline)" />
          <ion-badge class="mb-[25px] absolute ml-[35px]" color="secondary"
          >{{ currInboxItem.comments.length }}
          </ion-badge>
        </ion-button>
        <ion-button fill="clear" color="light" @click="shareImg(currInboxItem.image)" class="flex-grow" size="large">
          <ion-icon :icon="svg(mdiShareVariantOutline)" />
        </ion-button>
        <ion-button fill="clear" color="light" id="delete-alert" class="flex-grow" size="large">
          <ConfirmationAlert
            header="Are you sure?"
            trigger="delete-alert"
            message="This drawing will be deleted permanently"
            @confirm="removeFromInboxItem"
          />
          <ion-icon :icon="svg(mdiDeleteOutline)" />
        </ion-button>
      </div>


      <CommentDrawer
        :index-of-curr-inbox-item="slide"
        :curr-inbox-item="currInboxItem"
        v-model:open="isCommentDrawerOpen"
        :user="user"
      />
      <PhotoSwiperFollowersDrawer :followers="currInboxItem.followers" :user="user"
                                  v-model:open="isFollowerDrawerOpen" />
    </div>
  </transition>
</template>

<script setup lang="ts">
import { usePhotoSwiper } from '@/store/photoswiper.store'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { arrowBack } from 'ionicons/icons'
import { senderImg, senderName, svg } from '@/helper/general.helper'
import {
  mdiChatOutline,
  mdiChatRemoveOutline,
  mdiCommentOutline,
  mdiDeleteOutline,
  mdiReplyOutline,
  mdiShareVariantOutline
} from '@mdi/js'
import { IonAvatar, IonBadge, IonButton, IonButtons, IonIcon, IonToolbar, useBackButton } from '@ionic/vue'
import { InboxItem } from '@/types/server.types'
import { useAuthStore } from '@/store/auth.store'
import { register } from 'swiper/element/bundle'
import { shareImg } from '@/helper/share.helper'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import { useDrawStore } from '@/draw/store/draw.store'
import { useAPI } from '@/service/api/api.service'
import { useToast } from '@/service/toast.service'
import { EventBus } from '@/main'
import CommentDrawer from '@/components/photoswiper/CommentDrawer.vue'
import PhotoSwiperFollowersDrawer from '@/components/photoswiper/PhotoSwiperFollowersDrawer.vue'
import router from '@/router'
import PhotoSwiperItem from '@/components/photoswiper/PhotoSwiperItem.vue'
import { useInboxStore } from '@/store/inbox.store'
import { useSessionStore } from '@/store/session.store'

register()

const { open, slide } = storeToRefs(usePhotoSwiper())
const { seeItem } = usePhotoSwiper()


const { inbox } = storeToRefs(useInboxStore())
const { user } = useAuthStore()
const { findUserInInboxUsers } = useInboxStore()
const { toast, dismiss } = useToast()


const currInboxItem = computed<InboxItem>(() => inbox.value![slide.value])


const showComments = ref(true)
const isCommentDrawerOpen = ref(false)
const isFollowerDrawerOpen = ref(false)
const badgesCountToShow = 3

const swiper = ref<any>()
const api = useAPI()

const { updateSlide } = storeToRefs(useSessionStore())
watch(
  inbox,
  (first, second) => {
    if (first?.length == second?.length || !updateSlide.value) return
    nextTick(() => swiper.value?.swiper.update())
    updateSlide.value = false
  }
)


const escListener = (event: KeyboardEvent) => {
  event.stopPropagation()
  if (isCommentDrawerOpen.value || isFollowerDrawerOpen.value) return
  if (event.key === 'Escape' || event.keyCode === 27) {
    open.value = false
  }
}

useBackButton(9000, (processNextHandler) => {
  if (open.value) close()
  else processNextHandler()
})

function close() {
  open.value = false
  swiper.value?.swiper.zoom.out()
  window.removeEventListener('keydown', escListener)
}

watch(
  open,
  async () => {
    if (open.value) {
      dismiss()
      window.addEventListener('keydown', escListener)
    } else {
      close()
    }
  }
)
watch(currInboxItem, () => {
  if (!currInboxItem.value || !open.value) return
  seeItem()
})

EventBus.on('goToSlide', goToSlide)

function goToSlide() {
  nextTick(() => swiper.value?.swiper?.slideTo(slide.value, 0))
  seeItem()
  checkQueryParams()
}


function replyToDrawing() {
  close()
  const { reply } = useDrawStore()
  reply(currInboxItem.value)
}

function removeFromInboxItem() {
  api.removeFromInbox({
    user_id: user!._id,
    inbox_id: currInboxItem.value._id
  })

  const tmp = slide.value
  slide.value = Math.max(0, slide.value - 1)
  if (inbox.value?.length === 1) open.value = false
  inbox.value = (inbox.value as any)?.toSpliced(tmp, 1)
  toast('Item deleted')
}

function checkQueryParams() {
  const query = router.currentRoute.value.query
  isCommentDrawerOpen.value = query.comments === 'true'

  setTimeout(() => router.replace({ query: undefined }), 100)
}

</script>

<style scoped>
ion-toolbar {
  --background: #000000;
}

.expand-enter-active {
  opacity: 0;
  transform: scale(0.8); /* Start at 90% scale */
  transition: all 0.1s ease-out;
}

.expand-enter-to {
  opacity: 1;
  transform: scale(1); /* End at 100% scale */
}

.expand-leave-active {
  opacity: 1;
  transform: scale(1);
  transition: all 0.1s ease-in;
}

.expand-leave-to {
  opacity: 0;
  transform: scale(0.8); /* Shrink back to 90% scale */
}

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
}

</style>