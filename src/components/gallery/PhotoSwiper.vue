<template>
  <ion-modal
    :is-open="open"
    @will-dismiss="close"
    @will-present="checkQueryParams"
    @did-present="onOpen"
    :enter-animation="modalPopAnimation"
    :leave-animation="leaveAnimation"
    @ionModalDidPresent="consumeNotification"
    :can-dismiss="() => !isCommentDrawerOpen"
  >
    <div class="flex flex-col container max-w-full" v-if="user && currInboxItem">
      <ion-toolbar class="w-full h-[56px] flex">
        <ion-buttons slot="start">
          <ion-button @click="close" color="white">
            <ion-icon :icon="arrowBack" />
          </ion-button>
        </ion-buttons>

        <ion-buttons slot="end">
          <ion-button
            @click="showComments = !showComments"
            color="white"
            class="pr-2"
            v-if="currInboxItem.comments.length > 0"
          >
            <ion-icon :icon="svg(showComments ? mdiChatRemoveOutline : mdiChatOutline)" class="w-[25px] h-[25px]" />
          </ion-button>
          <ion-avatar class="flex justify-center items-center w-[35px]"
            ><img :src="senderImg(user, currInboxItem.sender)" alt="" class="aspect-square"
          /></ion-avatar>
        </ion-buttons>
      </ion-toolbar>
      <swiper-container
        class="w-full h-full relative flex-grow"
        :slides-per-view="1"
        keyboard-enabled="true"
        @slidechange="onSlideChange"
        :initial-slide="slide"
        lazyPreloadPrevNext="3"
        :zoom="true"
        ref="swiper"
        @update="() => swiper.swiper.slideTo(slide + 1, 0)"
      >
        <div class="w-full h-full absolute z-50 flex justify-center items-center bg-black" v-if="loading"
          ><ion-spinner color="primary"
        /></div>
        <swiper-slide v-for="(item, i) in props.inboxItems" :key="i" class="flex justify-center items-center">
          <div class="swiper-zoom-container">
            <img :src="item.image" alt="drawing" class="object-contain bg-white" />
          </div>
        </swiper-slide>
      </swiper-container>

      <div v-if="currInboxItem && showComments" @click="isCommentDrawerOpen = true" class="comments cursor-pointer">
        <div v-for="(comment, i) in currInboxItem.comments.slice(0, 4)" :key="i" class="rounded-full comment p-1">
          <div class="flex items-center pl-1">
            <ion-avatar class="flex justify-center items-center w-[30px] h-[30px]"
              ><img :src="senderImg(user, comment.sender)" alt="" class="aspect-square"
            /></ion-avatar>
            <div class="flex-1 ml-2">
              <div class="text-xs font-bold text-white">{{ senderName(user, comment.sender) }}</div>
              <div class="text-xs text-white">{{ comment.message }}</div>
            </div>
          </div>
        </div>
        <div v-if="currInboxItem.comments.length > 4" class="rounded-full comment my-1">
          <p class="text-xs text-white py-1 pl-2">{{
            `Click to see ${currInboxItem.comments.length - 4} more comments`
          }}</p>
        </div>
      </div>

      <div class="flex justify-evenly w-full items-center h-[56px]">
        <ion-button fill="clear" color="white" @click="replyToDrawing" class="flex-grow" size="large">
          <ion-icon :icon="svg(mdiReplyOutline)" />
        </ion-button>

        <ion-button
          fill="clear"
          color="white"
          @click="() => (isCommentDrawerOpen = true)"
          class="flex-grow"
          size="large"
        >
          <ion-icon :icon="svg(mdiCommentOutline)" />
          <ion-badge class="mb-[25px] absolute ml-[35px]" color="secondary"
            >{{ currInboxItem.comments.length }}
          </ion-badge>
        </ion-button>
        <ion-button fill="clear" color="white" @click="shareImg(currInboxItem.image)" class="flex-grow" size="large">
          <ion-icon :icon="svg(mdiShareVariantOutline)" />
        </ion-button>
        <ion-button fill="clear" color="white" id="delete-alert" class="flex-grow" size="large">
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
      />
    </div>
  </ion-modal>
</template>

<script lang="ts" setup>
import { InboxItem, NotificationType } from '@/types/server.types'
import { IonAvatar, IonBadge, IonButton, IonButtons, IonIcon, IonModal, IonToolbar } from '@ionic/vue'
import { computed, nextTick, ref, watch } from 'vue'
import { register } from 'swiper/element/bundle'
import { useAPI } from '@/service/api/api.service'
import { useAppStore } from '@/store/app.store'
import { arrowBack } from 'ionicons/icons'
import { leaveAnimation, modalPopAnimation } from '@/helper/animation.helper'
import { senderImg, senderName, setAppColors, svg } from '@/helper/general.helper'
import {
  mdiChatOutline,
  mdiChatRemoveOutline,
  mdiCommentOutline,
  mdiDeleteOutline,
  mdiReplyOutline,
  mdiShareVariantOutline
} from '@mdi/js'
import { shareImg } from '@/helper/share.helper'
import CommentDrawer from '@/components/gallery/CommentDrawer.vue'
import router from '@/router'
import { FRONTEND_ROUTES } from '@/types/router.types'
import { colorsPerRoute, photoSwiperColorConfig } from '@/config/colors.config'
import ConfirmationAlert from '@/components/general/ConfirmationAlert.vue'
import { useDrawStore } from '@/store/draw/draw.store'
import { useToast } from '@/service/toast.service'
import { EventBus } from '@/main'
import { storeToRefs } from 'pinia'

register()
const props = defineProps({
  open: {
    type: Boolean,
    required: true
  },
  slide: {
    type: Number,
    required: true
  },
  inboxItems: {
    type: Array<InboxItem>,
    required: true
  }
})

const emit = defineEmits(['update:open', 'update:slide', 'remove', 'see'])

const api = useAPI()
const swiper = ref<any>()
const { user, consumeNotificationLoading } = useAppStore()
const { updateSlide } = storeToRefs(useAppStore())

const currInboxItem = computed<InboxItem>(() => props.inboxItems![props.slide!])
const showComments = ref(true)
const isCommentDrawerOpen = ref(false)

watch(
  () => props.inboxItems,
  (first, second) => {
    if (first?.length == second?.length || !updateSlide.value) return
    nextTick(() => swiper.value?.swiper.update())
    updateSlide.value = false
  }
)

const goToSlide = (index: any) => {
  swiper.value?.swiper?.slideTo(index)
}

function consumeNotification() {
  consumeNotificationLoading(NotificationType.comment)
  consumeNotificationLoading(NotificationType.message)
}

function onOpen() {
  setAppColors(photoSwiperColorConfig)
  EventBus.on('go_to_slide', goToSlide)
  const { dismiss } = useToast()
  dismiss()
  seeItem()
}

function checkQueryParams() {
  const query = router.currentRoute.value.query
  isCommentDrawerOpen.value = query.comments === 'true'

  /// hack used to detect the exception in routerAnimation()
  setTimeout(() => router.replace({ query: undefined }), 100)
}

function replyToDrawing() {
  close()
  const { reply } = useDrawStore()
  reply(currInboxItem.value)
}

function close() {
  setAppColors(colorsPerRoute[FRONTEND_ROUTES.gallery])
  EventBus.off('go_to_slide', goToSlide)
  emit('update:open', false)
}

function onSlideChange(x: any) {
  emit('update:slide', x.target.swiper.activeIndex)
}

function removeFromInboxItem() {
  api.removeFromInbox({
    user_id: user!._id,
    inbox_id: currInboxItem.value._id
  })
  emit('remove')
}

function seeItem() {
  if (
    props.open &&
    (!currInboxItem.value.seen_by.includes(user!._id) || !currInboxItem.value.comments_seen_by.includes(user!._id))
  ) {
    emit('see')
  }
}

watch(currInboxItem, seeItem)
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
}

ion-toolbar {
  --background: #000000;
}

.container {
  position: relative;
  top: env(safe-area-inset-top);
  height: calc(100% - env(safe-area-inset-top) - env(safe-area-inset-bottom));
}

ion-modal {
  --background: #000000;
  --height: 100%;
  --width: 100%;
}
</style>
