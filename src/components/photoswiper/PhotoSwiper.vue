<template>
  <transition name="expand">
    <div class="fixed w-full h-full bg-black z-[99999999] flex flex-col safe-area" v-if="open && user && currItem">

      <PhotoSwiperHeader
        :curr-item="currItem"
        v-model:show-comments="showComments"
        @close="close"
        @open-followers="isFollowerDrawerOpen = true"
        :user-lookup="config.userLookup"
      />

      <swiper-container
        class="w-full grow"
        :initial-slide="slide"
        :zoom="{maxRatio: 3}"
        @swiperslidechange="handleSlideChange"
        ref="swiper"
      >
        <swiper-slide v-for="(item, i) in collection" :key="item._id || i">
          <div class="swiper-zoom-container" v-if="Math.abs(slide - i) < 3">
            <PhotoSwiperItem
              :thumbnail="resolveThumbnail(item)"
              :image="resolveImage(item)"
              :switch-to-image="Math.abs(slide - i) < 3"
            />
          </div>
        </swiper-slide>
      </swiper-container>


      <PhotoSwiperFooter
        :curr-item="currItem"
        :show-comments="showComments"
        :can-reply="config.canReply"
        :can-delete="canDelete"
        :user-lookup="config.userLookup"
        @open-comments="isCommentDrawerOpen = true"
        @reply="handleReply"
        @delete="handleDelete"
        @react="handleReact"
      />
<!--      <CommentDrawer-->
<!--        :index-of-curr-inbox-item="slide"-->
<!--        :curr-inbox-item="currItem"-->
<!--        v-model:open="isCommentDrawerOpen"-->
<!--        :user="user"-->
<!--      />-->
<!--      <PhotoSwiperFollowersDrawer-->
<!--        v-if="currItem"-->
<!--        :followers="currItem.followers || []"-->
<!--        :user="user"-->
<!--        v-model:open="isFollowerDrawerOpen"-->
<!--      />-->
    </div>
  </transition>
</template>

<script setup lang="ts">
import { usePhotoSwiper } from '@/store/photoswiper.store'
import { storeToRefs } from 'pinia'
import { computed, nextTick, ref, watch } from 'vue'
import { useBackButton } from '@ionic/vue'
import { useAuthStore } from '@/store/auth.store'
import { register } from 'swiper/element/bundle'
import { EventBus } from '@/main'
import router from '@/router'
import { useSessionStore } from '@/store/session.store'

// Components
import PhotoSwiperItem from '@/components/photoswiper/PhotoSwiperItem.vue'
import PhotoSwiperHeader from '@/components/photoswiper/PhotoSwiperHeader.vue'
import PhotoSwiperFooter from '@/components/photoswiper/PhotoSwiperFooter.vue'
import { fetchPostComments } from '@/service/api/post.api'

register()

const swiperStore = usePhotoSwiper()
const { open, slide, collection, config } = storeToRefs(swiperStore)
const { seeItem } = swiperStore
const { user } = storeToRefs(useAuthStore())
const { updateSlide } = storeToRefs(useSessionStore())

const currItem = computed(() => collection.value[slide.value] || null)

const showComments = ref(true)
const isCommentDrawerOpen = ref(false)
const isFollowerDrawerOpen = ref(false)
const swiper = ref<any>()

const canDelete = computed(() => {
  if (!user.value || !currItem.value) return false
  if (config.value.canDelete) return config.value.canDelete(currItem.value, user.value)
  return currItem.value.sender === user.value._id || currItem.value.creator_id === user.value._id
})

function handleSlideChange(event: any) {
  if (!open.value || !event.target.swiper) return
  slide.value = event.target.swiper.activeIndex
}

watch(
  collection,
  (first, second) => {
    if (first?.length == second?.length || !updateSlide.value) return
    nextTick(() => swiper.value?.swiper?.update())
    updateSlide.value = false
  },
  { deep: true }
)

// FIX: Added Keyboard Navigation Logic back
const keyboardListener = (event: KeyboardEvent) => {
  event.stopPropagation()

  // Disable keyboard navigation if drawers are open to prevent accidental swipes
  if (isCommentDrawerOpen.value || isFollowerDrawerOpen.value) return

  if (event.key === 'Escape') {
    close()
  } else if (event.key === 'ArrowRight') {
    swiper.value?.swiper?.slideNext()
  } else if (event.key === 'ArrowLeft') {
    swiper.value?.swiper?.slidePrev()
  }
}

useBackButton(9000, (processNextHandler) => {
  if (open.value) close()
  else processNextHandler()
})

function close() {
  open.value = false
  swiper.value?.swiper?.zoom?.out()
  window.removeEventListener('keydown', keyboardListener)
}

watch(open, async () => {
  if (open.value) {
    window.addEventListener('keydown', keyboardListener)

    await nextTick()
    await nextTick()

    if (swiper.value?.swiper) {
      const s = swiper.value.swiper
      s.update() // Force swiper to recalculate slide count
      s.slideTo(slide.value, 0, false)
    }
  } else {
    close()
  }
})

watch(currItem, async () => {
  if (!currItem.value || !open.value) return
  seeItem()

  if (currItem.value.author_id && !currItem.value.commentsLoaded) {
    try {
      const res = await fetchPostComments(currItem.value._id, 1, 5)
      currItem.value.comments = res.comments || []
      currItem.value.commentsLoaded = true
    } catch (e) {
      console.error('Failed to pre-fetch comments for preview', e)
    }
  }
})

// TODO remove
EventBus.on('goToSlide', () => {
  nextTick(() => swiper.value?.swiper?.slideTo(slide.value, 0))
  seeItem()
  checkQueryParams()
})

function handleReply() {
  if (config.value.onReply) {
    close()
    config.value.onReply(currItem.value)
  }
}

function handleDelete() {
  if (config.value.onDelete) {
    config.value.onDelete(currItem.value)
    const tmp = slide.value
    slide.value = Math.max(0, slide.value - 1)
    if (collection.value?.length === 1) open.value = false
  }
}

function checkQueryParams() {
  const query = router.currentRoute.value.query
  isCommentDrawerOpen.value = query.comments === 'true'
  setTimeout(() => router.replace({ query: undefined }), 100)
}

function resolveImage(item: any) {
  return config.value.imageResolver ? config.value.imageResolver(item) : (item.image_url || item.image)
}

function resolveThumbnail(item: any) {
  return config.value.thumbnailResolver ? config.value.thumbnailResolver(item) : (item.thumbnail_url || item.thumbnail)
}

function handleReact(type: string) {
  if (config.value.onReact) {
    config.value.onReact(currItem.value, type)
  }
}
</script>

<style scoped>
.expand-enter-active {
  opacity: 0;
  transform: scale(0.8);
  transition: all 0.1s ease-out;
}

.expand-enter-to {
  opacity: 1;
  transform: scale(1);
}

.expand-leave-active {
  opacity: 1;
  transform: scale(1);
  transition: all 0.1s ease-in;
}

.expand-leave-to {
  opacity: 0;
  transform: scale(0.8);
}
</style>