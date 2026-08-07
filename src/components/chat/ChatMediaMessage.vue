<template>
  <button
    v-if="msg.shared_post_id"
    class="tap-guard block w-40 rounded-2xl overflow-hidden border shadow-sm relative transition-transform duration-200 text-left p-1.5 bg-white border-primary/50 active:scale-[0.98]"
    :class="{ 'opacity-40 cursor-not-allowed bg-black/5': unavailable }"
    :disabled="loadingPost || unavailable"
    @click="openSharedPost"
    @contextmenu.prevent
  >
    <div class="aspect-square bg-[#FAF8F5] rounded-xl relative overflow-hidden border border-black/5">
      <img
        v-if="sharedPost?.thumbnail_url"
        :src="sharedPost.thumbnail_url"
        class="w-full h-full object-cover"
        loading="lazy"
        alt=""
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <ion-spinner v-if="loadingPost" name="dots" color="secondary" class="scale-75" />
        <ion-icon v-else :icon="svg(mdiImageBroken)" class="text-xl text-black/20" />
      </div>
    </div>
    <div class="pt-1.5 pb-1 px-0.5 flex items-center gap-1 text-black/80">
      <ion-icon :icon="svg(mdiDraw)" class="text-xs shrink-0" />
      <span class="text-xs font-black uppercase tracking-wider truncate cabin-sketch-regular leading-none mt-[1px]">
        {{ postCaption }}
      </span>
    </div>
    <MessageTimestamp :msg="msg" :is-me="isMe" :active-tab="activeTab" />
  </button>

  <button
    v-else
    class="tap-guard block w-40 rounded-2xl overflow-hidden border shadow-sm relative transition-transform duration-200 text-left p-1.5 bg-white border-primary/50 active:scale-[0.98]"
    :class="{ 'opacity-40 cursor-not-allowed bg-black/5': unavailableInbox }"
    :disabled="loadingInbox || unavailableInbox"
    @click="openSharedInboxItem"
    @contextmenu.prevent
  >
    <div class="aspect-square bg-[#FAF8F5] rounded-xl relative overflow-hidden border border-black/5">
      <img
        v-if="sharedInboxItem?.thumbnail"
        :src="sharedInboxItem.thumbnail"
        class="w-full h-full object-cover"
        loading="lazy"
        alt=""
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <ion-spinner v-if="loadingInbox" name="dots" color="secondary" class="scale-75" />
        <ion-icon v-else :icon="svg(mdiImageBroken)" class="text-xl text-black/20" />
      </div>
    </div>
    <div class="pt-1.5 pb-1 px-0.5 flex items-center gap-1 text-black/80">
      <ion-icon :icon="svg(mdiDraw)" class="text-xs shrink-0" />
      <span class="text-xs font-black uppercase tracking-wider truncate cabin-sketch-regular leading-none mt-[1px]">
        Gallery Sketch
      </span>
    </div>
    <MessageTimestamp :msg="msg" :is-me="false" :active-tab="activeTab" />
  </button>
</template>

<script setup lang="ts">
import { IonIcon, IonSpinner } from "@ionic/vue";
import { mdiDraw, mdiImageBroken } from "@mdi/js";
import { computed, onMounted, ref } from "vue";
import { useInboxSwiper } from "@/composables/gallery/useInboxSwiper";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import { svg } from "@/helper/general.helper";
import { useInboxStore } from "@/store/inbox.store";
import { usePostStore } from "@/store/post.store";
import MessageTimestamp from "./MessageTimestamp.vue";

const props = defineProps<{
	msg: any;
	isMe: boolean;
	activeTab: string;
}>();

const postStore = usePostStore();
const inboxStore = useInboxStore();
const { openPostSwiper } = usePostSwiper();
const { openInboxSwiper } = useInboxSwiper();

const loadingPost = ref(false);
const loadingInbox = ref(false);
const unavailable = ref(false);
const unavailableInbox = ref(false);

const sharedPost = computed(() =>
	props.msg.shared_post_id
		? postStore.getCachedPost(props.msg.shared_post_id)
		: null,
);
const sharedInboxItem = computed(() =>
	inboxStore.getInboxItem(props.msg.shared_inbox_item_id),
);
const postCaption = computed(() => {
	if (unavailable.value) return "Missing Sketch";
	return sharedPost.value?.author?.name
		? `${sharedPost.value.author.name}'s art`
		: "Shared art";
});

onMounted(async () => {
	if (props.msg.shared_post_id && !sharedPost.value) {
		loadingPost.value = true;
		const post = await postStore.fetchSinglePost(props.msg.shared_post_id);
		if (!post) unavailable.value = true;
		loadingPost.value = false;
	}
	if (props.msg.shared_inbox_item_id && !sharedInboxItem.value) {
		loadingInbox.value = true;
		const item = await inboxStore.fetchSingleInboxItem(
			props.msg.shared_inbox_item_id,
		);
		if (!item) unavailableInbox.value = true;
		loadingInbox.value = false;
	}
});

const openSharedPost = async () => {
	if (unavailable.value) return;
	let post = sharedPost.value;
	if (!post && props.msg.shared_post_id) {
		loadingPost.value = true;
		post = await postStore.fetchSinglePost(props.msg.shared_post_id);
		loadingPost.value = false;
		if (!post) {
			unavailable.value = true;
			return;
		}
	}
	if (post) openPostSwiper([post], 0);
};

const openSharedInboxItem = async () => {
	if (unavailableInbox.value) return;
	let item = sharedInboxItem.value;
	if (!item && props.msg.shared_inbox_item_id) {
		loadingInbox.value = true;
		item = await inboxStore.fetchSingleInboxItem(
			props.msg.shared_inbox_item_id,
		);
		loadingInbox.value = false;
		if (!item) {
			unavailableInbox.value = true;
			return;
		}
	}
	if (item) openInboxSwiper([item], 0);
};
</script>
