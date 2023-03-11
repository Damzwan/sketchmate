<template>
  <v-dialog v-model="dialog" eager fullscreen>
    <v-sheet class="pa-0 h-100" color="black" ref="container" v-touch="{ down: () => close() }">
      <v-toolbar color="transparent">
        <template v-slot:prepend>
          <v-btn :icon="mdiArrowLeft" color="white" class="pa-0" @click="close"/>
        </template>

        <template v-slot:append v-if="currInboxItem">
          <v-btn v-if="currInboxItem.comments.length > 0" :icon="showComments ? mdiEye : mdiEyeOff" color="white"
                 class="pa-0" @click="showComments = !showComments"/>
        </template>
      </v-toolbar>

      <swiper-container :slides-per-view="1" keyboard-enabled="true" class="img_container"

                        @slidechange="onSlideChange" :initial-slide="slide"
                        ref="swiperRef">
        <swiper-slide v-for="(item, i) in props.inboxItems" :key="i" lazy="true">
          <v-img :lazy-src="item.image" :src="item.image" height="100%"/>
        </swiper-slide>
      </swiper-container>

      <div class="comments" v-if="currInboxItem" @click="isCommentDrawerOpen = true">
        <v-row v-for="(comment, i) in currInboxItem.comments.slice(0, 4)" :key="i" class="rounded-pill comment my-1"
               no-gutters :style="{ 'opacity': `${showComments ? 1 : 0}` }">
          <v-col cols="2" class="d-flex align-center pl-1">
            <v-avatar color="primary" size="32"
                      :image="comment.sender === user._id ? user.img : user.mate.img"></v-avatar>
          </v-col>
          <v-col cols="8" class="d-flex flex-column ml-1">
            <div class="text-caption font-weight-bold">
              {{ comment.sender === user._id ? user.name : user.mate.name }}
            </div>
            <div class="text-caption mt-n1 comments_text">
              {{ comment.message }}
            </div>
          </v-col>
        </v-row>
      </div>
      <v-toolbar color="black" class="bottom_bar">
        <v-spacer></v-spacer>
        <v-btn :icon="mdiReply" color="white" variant="text" @click="reply(currInboxItem)" stacked/>
        <v-btn color="white" variant="text" stacked @click="() => isCommentDrawerOpen = true">
          <v-badge :content="currInboxItem.comments.length" inline color="transparent" v-if="currInboxItem">
            <v-icon :icon=" mdiCommentOutline"/>
          </v-badge>
        </v-btn>
        <v-btn :icon="mdiShareVariant" color="white" variant="text" @click="shareImg" stacked/>
        <v-btn :icon="mdiDelete" color="white" variant="text" @click="removeFromInboxItem" stacked/>
        <v-spacer></v-spacer>
      </v-toolbar>
    </v-sheet>
    <CommentDrawer v-model:open="isCommentDrawerOpen" v-model:curr-inbox-item="currInboxItem"
                   :index-of-curr-inbox-item="inboxItems.length - 1 - slide"/>
  </v-dialog>
</template>

<script lang="ts" setup>

import {Comment, InboxItem} from '@/types/server.types';
import {
  mdiArrowLeft,
  mdiCommentOffOutline,
  mdiCommentOutline,
  mdiDelete,
  mdiEye,
  mdiEyeOff,
  mdiReply,
  mdiShareVariant
} from '@mdi/js';
import {computed, onMounted, ref, watch} from 'vue';
import {Swiper} from 'swiper';
import {register} from 'swiper/element/bundle';
import {useAPI} from '@/service/api.service';
import {useAppStore} from '@/store/app.store';
import {useDrawStore} from '@/store/draw.store';
import CommentDrawer from '@/components/gallery/CommentDrawer.vue';
import {useClipboard, useShare} from '@vueuse/core';
import {useMessenger} from '@/service/messenger.service';
import {useRouter} from 'vue-router';

register();
const swiperRef = ref();
const swiper = ref<Swiper>();
const api = useAPI()
const {user} = useAppStore()
const {reply} = useDrawStore()
const {showMsg} = useMessenger()

onMounted(() => {
  swiper.value = swiperRef.value.swiper;
})

const props = defineProps({
  open: Boolean,
  slide: Number,
  inboxItems: Array<InboxItem>
})

const emit = defineEmits(['update:open', 'update:slide', 'remove'])
const currInboxItem = computed<InboxItem>(() => props.inboxItems![props.slide!])
const showComments = ref(true);
const isCommentDrawerOpen = ref(false)


const {copy, isSupported: isCopySupported} = useClipboard()
const {isSupported: isShareSupport} = useShare()

watch(currInboxItem, () => {
  console.log(currInboxItem.value)
})

const dialog = computed({
  get() {
    return props.open
  },
  set(newValue) {
    emit("update:open", newValue);
  },
});


function close() {
  emit("update:open", false);
}


function onSlideChange() {
  emit("update:slide", swiper.value!.activeIndex);
}


function removeFromInboxItem() {
  const currInboxItem = props.inboxItems![props.slide!]
  api.removeFromInbox({
    user_id: user!._id,
    inbox_id: currInboxItem._id
  })
  emit("remove");
}

// TODO duplication
async function shareImg() {
  if (isShareSupport.value) {
    await navigator.share({
      url: currInboxItem.value.image,
    })
  } else if (isCopySupported.value) {
    await copy(currInboxItem.value.image);
    showMsg('success', 'Copied image!', undefined, undefined, 1000);
  }
}


watch(() => props.slide, () => {
  swiper.value?.slideTo(props.slide!)
}, {deep: true})


</script>

<style scoped>
.bottom_bar {
  bottom: 5px;
  position: absolute;
  width: 100%;
}

.img_container {
  height: 85%;
  width: 100%;
}

.comments {
  position: absolute;
  right: 0;
  bottom: 70px;
  z-index: 1000;
  width: 250px;
  padding: 10px;
}

.comment {
  background-color: rgba(0, 0, 0, 0.6) !important;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.comments_text {
  line-height: 0.75rem !important;
}
</style>
