<template>
  <div class="w-full">
    <!-- System Messages -->
    <div
      v-if="isSystemMessage"
      class="flex justify-center w-full my-2"
    >
      <!-- BALLOON MATCH -->
      <div
        v-if="msg.system_kind === 'balloon_match'"
        class="flex items-center gap-2 px-3 py-2 rounded-full bg-amber-400/15 border border-amber-400/40 shadow-sm"
      >
        <span class="text-base leading-none">🎈</span>
        <span class="text-[11px] font-bold cabin-sketch-regular text-black/70 uppercase tracking-wide">
          <template v-if="isAcceptor">
            You caught <span class="text-black/90">{{ otherPartyName }}</span>'s balloon
          </template>
          <template v-else>
            <span class="text-black/90">{{ otherPartyName }}</span> caught your balloon
          </template>
        </span>
      </div>

      <!-- LOBBY JOIN / LEAVE (existing) -->
      <div
        v-else
        @click="$emit('inspect-profile', $event, sender)"
        class="flex items-center gap-1.5 px-2 py-1 cursor-pointer active:opacity-60 transition-opacity"
      >
        <div class="origin-left scale-[0.75] w-8 h-8 flex items-center justify-center -mr-2">
          <UserAvatar
            v-if="sender"
            :user="sender"
            :customization="senderCustomization"
            size="xs"
            static
          />
        </div>
        <span class="text-[11px] font-bold cabin-sketch-regular text-black/40 uppercase">
          <span class="text-black/60">{{ sender?.name }}</span>
          <span class="ml-1">{{ msg.type === 'join' ? 'joined' : 'left' }}</span>
        </span>
      </div>
    </div>

    <!-- User Messages -->
    <div v-else class="flex items-start gap-2.5 px-1 py-0.5" :class="{'flex-row-reverse': isMe, 'mt-[-6px]': isCompact}">

      <div class="w-8 h-8 shrink-0 flex items-end justify-center" v-if="!isMe && !isCompact"  @click="$emit('inspect-profile', $event, sender)">
        <UserAvatar
          v-if="sender"
          :user="sender"
          :customization="senderCustomization"
          size="xs"
          static
        />
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

        <button
          v-else-if="msg.shared_inbox_item_id"
          @click="openSharedInboxItem"
          :disabled="loadingInbox || unavailableInbox"
          :class="[
    'block w-44 rounded-2xl overflow-hidden border shadow-sm relative transition-transform text-left mt-1',
    unavailableInbox ? 'bg-black/5 border-black/10 opacity-60 cursor-not-allowed' :
    isMe ? 'bg-secondary border-secondary active:scale-[0.97]' : 'bg-white/80 border-white/60 active:scale-[0.97]'
  ]"
        >
          <div class="aspect-square bg-black/5 relative">
            <img v-if="sharedInboxItem?.thumbnail" :src="sharedInboxItem.thumbnail" class="w-full h-full object-cover" loading="lazy" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <ion-spinner v-if="loadingInbox" name="bubbles" :color="isMe ? 'light' : 'secondary'" />
              <ion-icon v-else :icon="svg(mdiImageBroken)" class="text-2xl text-black/30" />
            </div>
          </div>
          <div class="px-3 py-2 flex items-center gap-1.5" :class="isMe ? 'text-white/90' : 'text-black/60'">
            <ion-icon :icon="svg(mdiDraw)" class="text-xs shrink-0" />
            <span class="text-[10px] font-black uppercase tracking-widest truncate cabin-sketch-regular">Gallery Sketch</span>
          </div>
        </button>

        <!-- REGULAR TEXT BUBBLE -->
        <div
          v-else
          class="py-2 px-3.5 text-[15px] shadow-sm cabin-sketch-regular tracking-wide"
          :class="isMe ? 'bg-secondary text-white rounded-2xl rounded-tr-sm' : 'bg-white/80 text-black rounded-2xl rounded-tl-sm border border-white/60'"
        >

          <div v-if="!isCompact && !isMe && activeTab === 'lobby'" class="mb-1 flex items-baseline gap-1.5 whitespace-nowrap">
            <span
              class="text-[10px] font-black uppercase"
              :style="{ color: theme.nameColor, fontFamily: resolvedFontFamily }"
            >
              {{ sender?.name }}
            </span>
            <span
              v-if="displayTitle"
              class="text-[8px] font-black uppercase truncate"
              :style="{ color: theme.descColor, fontFamily: resolvedFontFamily }"
            >
              • {{ displayTitle }}
            </span>
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
const inboxSwiper = useInboxSwiper();
const { user: me } = storeToRefs(useAuthStore());

const loadingPost = ref(false);
const unavailable = ref(false);

const sender = computed(() => props.msg.member || props.partner);

// System message detection — covers both the new 'system' type and the
// legacy lobby 'join'/'leave' types.
const isSystemMessage = computed(() => {
	const t = props.msg.type;
	return t && t !== "message" && t !== "user";
});

// Balloon match: was *I* the one who caught it?
const isAcceptor = computed(() => {
	return props.msg.system_payload?.acceptor_id === me.value?._id;
});

// Name of the *other* party in the match — used to render
// "you caught X's balloon" vs "Y caught your balloon".
const otherPartyName = computed(() => {
	const payload = props.msg.system_payload;
	if (!payload) return "someone";
	if (isAcceptor.value) {
		// I'm the acceptor → other party is the original sender
		return props.partner?.name || "someone";
	}
	// I'm the sender → other party is the acceptor
	return payload.acceptor_name || props.partner?.name || "someone";
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
	// Post Logic
	if (props.msg.shared_post_id && !sharedPost.value) {
		loadingPost.value = true;
		const post = await postStore.fetchSinglePost(props.msg.shared_post_id);
		if (!post) unavailable.value = true;
		loadingPost.value = false;
	}

	// Inbox Logic
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