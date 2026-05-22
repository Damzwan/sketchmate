<!-- components/chat/ChatMessageBubble.vue -->
<template>
  <div class="w-full">
    <!-- System Messages -->
    <div v-if="msg.type && msg.type !== 'message'" class="flex justify-center w-full my-2">
      <div
        @click="$emit('inspect-profile', $event, msg.member || partner)"
        class="flex items-center gap-1.5 px-2 py-1 cursor-pointer active:opacity-60 transition-opacity"
      >
        <img :src="msg.member?.img || partner?.img" class="w-6 h-6 rounded-full object-cover opacity-80" />
        <span class="text-[11px] font-bold cabin-sketch-regular text-black/40 uppercase">
          <span class="text-black/60">{{ msg.member?.name || partner?.name }}</span>
          <span class="ml-1">{{ msg.type === 'join' ? 'joined' : 'left' }}</span>
        </span>
      </div>
    </div>

    <!-- User Messages -->
    <div v-else class="flex items-start gap-2.5 px-1 py-0.5" :class="{'flex-row-reverse': isMe, 'mt-[-6px]': isCompact}">
      <div class="w-8 h-8 shrink-0 flex items-end" v-if="!isMe && !isCompact">
        <img :src="partner?.img" class="w-8 h-8 rounded-xl object-cover border-2 border-white shadow-sm" />
      </div>
      <div v-else-if="!isMe" class="w-8 shrink-0"></div>

      <div class="flex flex-col max-w-[75%]" :class="{ 'items-end': isMe }">

        <!-- SHARED POST BUBBLE -->
        <button
          v-if="msg.shared_post_id"
          @click="openSharedPost"
          :disabled="loadingPost || unavailable"
          :class="[
            'block w-44 rounded-2xl overflow-hidden border shadow-sm relative transition-transform text-left',
            unavailable
              ? 'bg-black/5 border-black/10 opacity-60 cursor-not-allowed'
              : isMe
                ? 'bg-secondary border-secondary active:scale-[0.97]'
                : 'bg-white/80 border-white/60 active:scale-[0.97]'
          ]"
        >
          <div class="aspect-square bg-black/5 relative">
            <img
              v-if="sharedPost?.thumbnail_url"
              :src="sharedPost.thumbnail_url"
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <ion-spinner v-if="loadingPost" name="bubbles" :color="isMe ? 'light' : 'secondary'" />
              <ion-icon v-else :icon="svg(mdiImageBroken)" class="text-2xl text-black/30" />
            </div>
          </div>
          <div
            class="px-3 py-2 flex items-center gap-1.5"
            :class="isMe ? 'text-white/90' : 'text-black/60'"
          >
            <ion-icon :icon="svg(mdiDraw)" class="text-xs shrink-0" />
            <span class="text-[10px] font-black uppercase tracking-widest truncate cabin-sketch-regular">
              {{
                unavailable
                  ? 'Sketch unavailable'
                  : sharedPost?.author?.name
                    ? `${sharedPost.author.name}'s sketch`
                    : 'Shared sketch'
              }}
            </span>
          </div>

          <!-- Timestamp + status overlay -->
          <div
            class="absolute bottom-1.5 right-2 text-[8px] font-sans flex items-center gap-1"
            :class="isMe ? 'text-white/70' : 'text-black/40'"
          >
            <span>{{ dayjs(msg.createdAt).format('HH:mm') }}</span>
            <span v-if="isMe && activeTab !== 'lobby'" class="text-[11px] flex items-center">
              <ion-icon v-if="msg.status === 'sending'" :icon="timeOutline" class="opacity-60" />
              <ion-icon v-else-if="msg.status === 'error'" :icon="alertCircleOutline" class="text-red-300" />
              <ion-icon v-else :icon="checkmarkDoneOutline" />
            </span>
          </div>
        </button>

        <!-- REGULAR TEXT BUBBLE -->
        <div
          v-else
          class="py-2 px-3.5 text-[15px] shadow-sm cabin-sketch-regular tracking-wide"
          :class="isMe ? 'bg-secondary text-white rounded-2xl rounded-tr-sm' : 'bg-white/80 text-black rounded-2xl rounded-tl-sm border border-white/60'"
        >
          <div v-if="!isCompact && !isMe && activeTab === 'lobby'" class="text-[8px] font-black mb-1 opacity-50 uppercase font-sans">
            {{ msg.member?.name || partner?.name }}
          </div>

          <div class="font-bold">{{ msg.content || msg.message }}</div>

          <div class="text-[8px] mt-1 font-sans opacity-80 flex justify-end items-center gap-1">
            <span>{{ dayjs(msg.createdAt).format('HH:mm') }}</span>
            <span v-if="isMe && activeTab !== 'lobby'" class="text-[11px] flex items-center">
              <ion-icon v-if="msg.status === 'sending'" :icon="timeOutline" class="opacity-60" />
              <ion-icon v-else-if="msg.status === 'error'" :icon="alertCircleOutline" class="text-red-300" />
              <ion-icon v-else :icon="checkmarkDoneOutline" class="text-white" />
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import dayjs from "dayjs";
import { IonIcon, IonSpinner } from "@ionic/vue";
import {
	timeOutline,
	alertCircleOutline,
	checkmarkDoneOutline,
} from "ionicons/icons";
import { mdiDraw, mdiImageBroken } from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import { usePostStore } from "@/store/post.store";
import { usePostSwiper } from "@/composables/home/usePostSwiper";

const props = defineProps<{
	msg: any;
	partner: any;
	isMe: boolean;
	isCompact: boolean;
	activeTab: string;
}>();

defineEmits(["inspect-profile"]);

const postStore = usePostStore();
const { postCache } = storeToRefs(postStore);
const { openPostSwiper } = usePostSwiper();

const loadingPost = ref(false);
const unavailable = ref(false);

// Reactive read from store cache — same instance shared across all bubbles
// referencing this post, and stays in sync if the cache is refreshed.
const sharedPost = computed(() =>
	props.msg.shared_post_id
		? postCache.value[props.msg.shared_post_id] || null
		: null,
);

onMounted(async () => {
	if (!props.msg.shared_post_id || sharedPost.value) return;
	loadingPost.value = true;
	const post = await postStore.fetchSinglePost(props.msg.shared_post_id);
	if (!post) unavailable.value = true;
	loadingPost.value = false;
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
</script>