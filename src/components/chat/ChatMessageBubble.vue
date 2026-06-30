<template>
  <div class="w-full overflow-visible">
    <!-- SYSTEM LEVEL MESSAGES -->
    <div v-if="isSystemMessage" class="flex justify-center w-full my-1.5 select-none">
      <!-- BALLOON MATCH STATUS ALERT CARD -->
      <div
        v-if="msg.system_kind === 'balloon_match'"
        class="flex items-center gap-2 px-3 py-1 bg-white border border-primary/50 shadow-sm rounded-full"
      >
        <span class="text-sm leading-none mt-[-2px]">🎈</span>
        <span class="text-[10px] font-black cabin-sketch-regular text-black/60 uppercase tracking-wide">
          <template v-if="isAcceptor">
            You caught <span class="text-black font-black">{{ otherPartyName }}</span>'s balloon
          </template>
          <template v-else>
            <span class="text-black font-black">{{ otherPartyName }}</span> caught your balloon
          </template>
        </span>
      </div>

      <!-- LOBBY ROOM ACTIONS: JOIN / LEAVE SEGMENTS -->
      <div
        v-else
        @click="$emit('inspect-profile', $event, sender)"
        class="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer active:opacity-60 transition-opacity"
      >
        <div class="origin-left scale-[0.7] w-8 h-8 flex items-center justify-center -mr-1.5">
          <UserAvatar v-if="sender" :user="sender" :customization="senderCustomization" size="xs" static class="shrink-0" />
        </div>
        <span class="text-[10px] font-black cabin-sketch-regular text-black/40 uppercase tracking-tight">
          <span class="text-black/60">{{ sender?.name }}</span>
          <span class="ml-1 font-bold">{{ msg.type === 'join' ? 'entered' : 'left' }}</span>
        </span>
      </div>
    </div>

    <!-- STANDARD USER MESSAGES -->
    <div  v-else class="flex items-start gap-2.5 px-0.5 py-0.5 w-full" :class="{'flex-row-reverse': isMe, 'mt-[-5px]': isCompact}">
      <!-- External Partner User Avatar Node -->
      <div class="w-8 h-8 shrink-0 flex items-center justify-center cursor-pointer" v-if="!isMe && !isCompact" @click="$emit('inspect-profile', $event, sender)">
        <UserAvatar v-if="sender" :user="sender" :customization="senderCustomization" size="xs" static class="shrink-0" />
      </div>
      <div v-else-if="!isMe" class="w-8 shrink-0"></div>

      <div class="flex flex-col max-w-[75%] overflow-visible" :class="{ 'items-end': isMe }">

        <!-- POLAROID LOOKBOOK LAYOUT: SHARED COMMUNITY POSTS -->
        <button
          v-if="msg.shared_post_id"
          @click="openSharedPost"
          :disabled="loadingPost || unavailable"
          :class="[
            'block w-40 rounded-2xl overflow-hidden border shadow-sm relative transition-all duration-200 text-left p-1.5 bg-white border-primary/50 hover:scale-[1.02] active:scale-[0.98]',
            unavailable ? 'opacity-40 cursor-not-allowed bg-black/5' : ''
          ]"
        >
          <div class="aspect-square bg-[#FAF8F5] rounded-xl relative overflow-hidden border border-black/5">
            <img v-if="sharedPost?.thumbnail_url" :src="sharedPost.thumbnail_url" class="w-full h-full object-cover" loading="lazy" alt="" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <ion-spinner v-if="loadingPost" name="dots" color="secondary" class="scale-75" />
              <ion-icon v-else :icon="svg(mdiImageBroken)" class="text-xl text-black/20" />
            </div>
          </div>
          <div class="pt-1.5 pb-1 px-0.5 flex items-center gap-1 text-black/50">
            <ion-icon :icon="svg(mdiDraw)" class="text-[10px] shrink-0" />
            <span class="text-[9px] font-black uppercase tracking-wider truncate cabin-sketch-regular leading-none mt-[1px]">
              {{ unavailable ? 'Missing Sketch' : sharedPost?.author?.name ? `${sharedPost.author.name}'s art` : 'Shared art' }}
            </span>
          </div>

          <!-- Timestamp overlay tags inside polaroid margins -->
          <div class="absolute bottom-1 right-2 text-[7px] font-sans text-black/30 flex items-center gap-0.5">
            <span>{{ dayjs(msg.createdAt).format('HH:mm') }}</span>
            <span v-if="isMe && activeTab !== 'lobby'" class="text-[9px] flex items-center">
              <ion-icon v-if="msg.status === 'sending'" :icon="timeOutline" class="opacity-40" />
              <ion-icon v-else-if="msg.status === 'error'" :icon="alertCircleOutline" class="text-red-400" />
              <ion-icon v-else :icon="checkmarkDoneOutline" class="text-secondary" />
            </span>
          </div>
        </button>

        <!-- POLAROID LOOKBOOK LAYOUT: SHARED PRIVATE GALLERY SKETCHES -->
        <button
          v-else-if="msg.shared_inbox_item_id"
          @click="openSharedInboxItem"
          :disabled="loadingInbox || unavailableInbox"
          :class="[
            'block w-40 rounded-2xl overflow-hidden border shadow-sm relative transition-all duration-200 text-left p-1.5 bg-white border-primary/50 hover:scale-[1.02] active:scale-[0.98]',
            unavailableInbox ? 'opacity-40 cursor-not-allowed bg-black/5' : ''
          ]"
        >
          <div class="aspect-square bg-[#FAF8F5] rounded-xl relative overflow-hidden border border-black/5">
            <img v-if="sharedInboxItem?.thumbnail" :src="sharedInboxItem.thumbnail" class="w-full h-full object-cover" loading="lazy" alt="" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <ion-spinner v-if="loadingInbox" name="dots" color="secondary" class="scale-75" />
              <ion-icon v-else :icon="svg(mdiImageBroken)" class="text-xl text-black/20" />
            </div>
          </div>
          <div class="pt-1.5 pb-1 px-0.5 flex items-center gap-1 text-black/50">
            <ion-icon :icon="svg(mdiDraw)" class="text-[10px] shrink-0" />
            <span class="text-[9px] font-black uppercase tracking-wider truncate cabin-sketch-regular leading-none mt-[1px]">Gallery Sketch</span>
          </div>

          <div class="absolute bottom-1 right-2 text-[7px] font-sans text-black/30 flex items-center gap-0.5">
            <span>{{ dayjs(msg.createdAt).format('HH:mm') }}</span>
          </div>
        </button>

        <!-- STANDALONE MICRO SKETCH BUBBLE (TEXT LAYOUT CONSOLE) -->
        <div
          v-else
          class="py-2 px-3 text-[15px] shadow-sm cabin-sketch-regular tracking-wide relative max-w-full overflow-visible"
          :class="isMe
            ? 'bg-secondary text-white rounded-2xl rounded-tr-sm'
            : 'bg-white text-black rounded-2xl rounded-tl-sm border border-primary/40'"
        >
          <!-- Dynamic Room Title Headers (Visible only if messaging inside lobbies) -->
          <div v-if="!isCompact && !isMe && activeTab === 'lobby'" class="mb-1 flex items-baseline gap-1 whitespace-nowrap leading-none">
            <span class="text-[9px] font-black uppercase tracking-tight" :style="{ color: theme.nameColor, fontFamily: resolvedFontFamily }">
              {{ sender?.name }}
            </span>
            <span v-if="displayTitle" class="text-[7px] font-black uppercase tracking-widest opacity-50 truncate" :style="{ color: theme.descColor, fontFamily: resolvedFontFamily }">
              • {{ displayTitle }}
            </span>
          </div>

          <div class="font-bold leading-snug break-words pr-2">{{ msg.content || msg.message }}</div>

          <!-- Micro Sync Data Pips -->
          <div class="text-[10px] mt-1 cabin-sketch-regular opacity-80 flex justify-end items-center gap-0.5 select-none leading-none">
            <span>{{ dayjs(msg.createdAt).format('HH:mm') }}</span>
            <span  v-if="isMe && activeTab !== 'lobby'" class="text-[9px] flex items-center leading-none">
              <ion-icon v-if="msg.status === 'sending'" :icon="timeOutline" class="opacity-50" />
              <ion-icon v-else-if="msg.status === 'error'" :icon="alertCircleOutline" class="text-red-300" />
              <ion-icon  v-else :icon="checkmarkDoneOutline" class="text-white/80" />
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
import { useAuthStore } from "@/store/auth.store";

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import {
	hydrateCustomization,
	resolveTheme,
	resolveFontFamily,
	resolveFontEffectClass,
	resolveTitle,
} from "@/config/profile_options.config";
import { useInboxStore } from "@/store/inbox.store";
import { useInboxSwiper } from "@/composables/gallery/useInboxSwiper";

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
const { user: me } = storeToRefs(useAuthStore());

const loadingPost = ref(false);
const unavailable = ref(false);

const sender = computed(() => props.msg.member || props.partner);
const isSystemMessage = computed(
	() =>
		props.msg.type && props.msg.type !== "message" && props.msg.type !== "user",
);
const isAcceptor = computed(
	() => props.msg.system_payload?.acceptor_id === me.value?._id,
);

const otherPartyName = computed(() => {
	const payload = props.msg.system_payload;
	if (!payload) return "someone";
	return isAcceptor.value
		? props.partner?.name || "someone"
		: payload.acceptor_name || props.partner?.name || "someone";
});

const senderCustomization = computed(() =>
	hydrateCustomization(sender.value?.customization),
);
const theme = computed(() => resolveTheme(senderCustomization.value.themeId));
const resolvedFontFamily = computed(() =>
	resolveFontFamily(senderCustomization.value.fontId),
);
const fontEffectClass = computed(() =>
	resolveFontEffectClass(senderCustomization.value.fontEffectId),
);
const displayTitle = computed(() =>
	resolveTitle(senderCustomization.value.titleId),
);

const inboxStore = useInboxStore();
const { openInboxSwiper } = useInboxSwiper();

const loadingInbox = ref(false);
const unavailableInbox = ref(false);

const sharedPost = computed(() =>
	props.msg.shared_post_id
		? postCache.value[props.msg.shared_post_id] || null
		: null,
);
const sharedInboxItem = computed(() => {
	if (!props.msg.shared_inbox_item_id) return null;
	return (
		inboxStore.inbox.find((i) => i._id === props.msg.shared_inbox_item_id) ||
		null
	);
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

<style scoped>
.msg-bubble-enter-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.msg-bubble-enter-from {
  opacity: 0;
  transform: scale(0.9) translateY(8px);
}
</style>