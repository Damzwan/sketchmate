<template>
  <div class="w-full overflow-visible msg-row"
       :class="{ 'mt-[-5px]': isCompact && !isSystemMessage, 'msg-row--media': isMediaMessage }">
    <!-- SYSTEM LEVEL MESSAGES -->
    <div v-if="isSystemMessage" class="flex justify-center w-full my-1.5 select-none">
      <!-- BALLOON MATCH STATUS ALERT CARD -->
      <div
        v-if="msg.system_kind === 'balloon_match'"
        class="flex items-center gap-2 px-3 py-1 bg-white border border-primary/50 shadow-sm rounded-full"
      >
        <ion-icon :icon="svg(mdiBalloon)" class="text-sm leading-none mt-[-2px] text-secondary" />
        <span class="text-xs font-black cabin-sketch-regular text-black/80 uppercase tracking-wide">
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
          <UserAvatar v-if="sender" :user="sender" :customization="senderCustomization" size="xs" static
                      class="shrink-0" />
        </div>
        <span class="text-xs cabin-sketch-regular text-black/80 uppercase tracking-tight">
          <span class="text-black/80 font-black">{{ sender?.name }}</span>
          <span class="ml-1">{{ msg.type === 'join' ? 'entered' : 'left' }}</span>
        </span>
      </div>
    </div>

    <!-- STANDARD USER MESSAGES -->
    <!-- The compact -5px lives on the ROW (see the class binding on the root),
         not here. `content-visibility` brings paint containment with it, which
         clips anything drawn outside this element's box — a child pulled up by
         a negative margin would have had its top shaved off. -->
    <div v-else class="flex items-start gap-2.5 px-0.5 py-0.5 w-full"
         :class="{'flex-row-reverse': isMe}">
      <!-- External Partner User Avatar Node -->
      <div class="w-8 h-8 shrink-0 flex items-center justify-center cursor-pointer" v-if="!isMe && !isCompact"
           @click="$emit('inspect-profile', $event, sender)">
        <UserAvatar v-if="sender" :user="sender" :customization="senderCustomization" size="xs" static
                    class="shrink-0" />
      </div>
      <div v-else-if="!isMe" class="w-8 shrink-0"></div>

      <div class="flex flex-col max-w-[75%] overflow-visible" :class="{ 'items-end': isMe }">

        <!-- POLAROID LOOKBOOK LAYOUT: SHARED COMMUNITY POSTS -->
        <button
          v-if="msg.shared_post_id"
          @click="openSharedPost"
          @contextmenu.prevent
          :disabled="loadingPost || unavailable"
          :class="[
            'tap-guard block w-40 rounded-2xl overflow-hidden border shadow-sm relative transition-all duration-200 text-left p-1.5 bg-white border-primary/50 hover:scale-[1.02] active:scale-[0.98]',
            unavailable ? 'opacity-40 cursor-not-allowed bg-black/5' : ''
          ]"
        >
          <div class="aspect-square bg-[#FAF8F5] rounded-xl relative overflow-hidden border border-black/5">
            <img v-if="sharedPost?.thumbnail_url" :src="sharedPost.thumbnail_url" class="w-full h-full object-cover"
                 loading="lazy" alt="" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <ion-spinner v-if="loadingPost" name="dots" color="secondary" class="scale-75" />
              <ion-icon v-else :icon="svg(mdiImageBroken)" class="text-xl text-black/20" />
            </div>
          </div>
          <div class="pt-1.5 pb-1 px-0.5 flex items-center gap-1 text-black/80">
            <ion-icon :icon="svg(mdiDraw)" class="text-xs shrink-0" />
            <span
              class="text-xs font-black uppercase tracking-wider truncate cabin-sketch-regular leading-none mt-[1px]">
              {{ unavailable ? 'Missing Sketch' : sharedPost?.author?.name ? `${sharedPost.author.name}'s art` : 'Shared art'
              }}
            </span>
          </div>

          <!-- Timestamp tag below caption -->
          <div class="flex justify-end px-0.5 pb-0.5 text-xs font-sans text-black/80 gap-0.5">
            <span>{{ dayjs(msg.createdAt).format('HH:mm') }}</span>
            <span v-if="isMe && activeTab !== 'lobby'" class="text-[9px] flex items-center">
              <svg viewBox="0 0 24 24" class="w-3 h-3 fill-current" :class="statusTick.class" aria-hidden="true">
                <path :d="statusTick.path" />
              </svg>
            </span>
          </div>
        </button>

        <button
          v-else-if="msg.shared_inbox_item_id"
          @click="openSharedInboxItem"
          @contextmenu.prevent
          :disabled="loadingInbox || unavailableInbox"
          :class="[
            'tap-guard block w-40 cursor-pointer rounded-2xl overflow-hidden border shadow-sm relative transition-all duration-200 text-left p-1.5 bg-white border-primary/50 hover:scale-[1.02] active:scale-[0.98]',
            unavailableInbox ? 'opacity-40 cursor-not-allowed bg-black/5' : ''
          ]"
        >
          <div class="aspect-square bg-[#FAF8F5] rounded-xl relative overflow-hidden border border-black/5">
            <img v-if="sharedInboxItem?.thumbnail" :src="sharedInboxItem.thumbnail" class="w-full h-full object-cover"
                 loading="lazy" alt="" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <ion-spinner v-if="loadingInbox" name="dots" color="secondary" class="scale-75" />
              <ion-icon v-else :icon="svg(mdiImageBroken)" class="text-xl text-black/20" />
            </div>
          </div>
          <div class="pt-1.5 pb-1 px-0.5 flex items-center gap-1 text-black/80">
            <ion-icon :icon="svg(mdiDraw)" class="text-xs shrink-0" />
            <span
              class="text-xs font-black uppercase tracking-wider truncate cabin-sketch-regular leading-none mt-[1px]">Gallery Sketch</span>
          </div>

          <div class="flex justify-end px-0.5 pb-0.5 text-xs font-sans text-black/80 gap-0.5">
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
          <!-- Name + earned title on one baseline row.
               `min-w-0` on the row AND on both spans is what makes this work: a
               flex item defaults to `min-width: auto`, so neither span would
               shrink below its own text and the pair overflowed the bubble's
               max-w-[75%]. That used to spill visibly; now that `.msg-row`
               carries content-visibility (and with it paint containment) the
               overflow is CLIPPED instead — which is why the title vanished
               rather than merely looking wrong. Both spans truncate, so a long
               name and a long title give ground together instead of one
               shoving the other out. -->
          <div v-if="!isCompact && !isMe && activeTab === 'lobby'"
               class="mb-1 flex items-baseline gap-1 leading-none min-w-0 max-w-full">
            <span
              class="text-xs font-black uppercase tracking-tight truncate min-w-0"
              :style="{ color: theme.nameColorOnLight, fontFamily: resolvedFontFamily }"
            >{{ sender?.name }}</span>

            <span
              v-if="displayTitle"
              class="text-[10px] uppercase tracking-widest opacity-80 truncate min-w-0"
              :style="{ color: theme.descColorOnLight, fontFamily: resolvedFontFamily }"
            >• {{ displayTitle }}</span>
          </div>

          <div class="cabin-sketch-regular leading-snug break-words pr-2">{{ msg.content || msg.message }}</div>

          <!-- Micro Sync Data Pips -->
          <div
            class="text-xs mt-1 cabin-sketch-regular opacity-80 flex justify-end items-center gap-0.5 select-none leading-none">
            <span>{{ dayjs(msg.createdAt).format('HH:mm') }}</span>
            <span v-if="isMe && activeTab !== 'lobby'" class="text-[9px] flex items-center leading-none">
              <svg viewBox="0 0 24 24" class="w-3 h-3 fill-current" :class="statusTick.classOnBubble" aria-hidden="true">
                <path :d="statusTick.path" />
              </svg>
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
	mdiAlertCircleOutline,
	mdiBalloon,
	mdiCheckAll,
	mdiClockOutline,
	mdiDraw,
	mdiImageBroken,
} from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg } from "@/helper/general.helper";
import { usePostStore } from "@/store/post.store";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import { useAuthStore } from "@/store/auth.store";

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useSenderStyle } from "@/composables/chat/useSenderStyle";
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

// Inline <svg>, not <ion-icon>. Every ion-icon is a custom element that upgrades,
// attaches a shadow root and resolves its icon asynchronously — negligible once,
// but this renders on roughly every message the user sent, so a long thread was
// paying for hundreds of shadow roots and icon lookups. The path data is a plain
// string from @mdi/js, so inlining costs one <path> node and nothing else.
const statusTick = computed(() => {
	if (props.msg.status === "sending")
		return {
			path: mdiClockOutline,
			class: "opacity-40",
			classOnBubble: "opacity-50",
		};
	if (props.msg.status === "error")
		return {
			path: mdiAlertCircleOutline,
			class: "text-red-400",
			classOnBubble: "text-red-300",
		};
	return {
		path: mdiCheckAll,
		class: "text-secondary",
		classOnBubble: "text-white/80",
	};
});

// Shared-sketch bubbles are ~3.5x the height of a text line, so they need their
// own `contain-intrinsic-size` — see the note in the style block.
const isMediaMessage = computed(
	() => !!(props.msg.shared_post_id || props.msg.shared_inbox_item_id),
);

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

// One computed, resolved once per SENDER and shared across every bubble — see
// useSenderStyle. Was five per bubble, each doing a linear config scan.
const senderStyle = useSenderStyle(sender);
const senderCustomization = computed(() => senderStyle.value.customization);
const theme = computed(() => senderStyle.value.theme);
const resolvedFontFamily = computed(() => senderStyle.value.fontFamily);
const displayTitle = computed(() => senderStyle.value.title);

const inboxStore = useInboxStore();
const { openInboxSwiper } = useInboxSwiper();

const loadingInbox = ref(false);
const unavailableInbox = ref(false);

const sharedPost = computed(() =>
	props.msg.shared_post_id
		? postCache.value[props.msg.shared_post_id] || null
		: null,
);
// Indexed lookup, not `inbox.find(...)` — one bubble per message meant this was
// O(messages × inbox) across the thread.
const sharedInboxItem = computed(() =>
	inboxStore.getInboxItem(props.msg.shared_inbox_item_id),
);

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
/* The enter animation moved to ChatMessageFlow.vue (`.msg-pop-in`) when the
   TransitionGroup was removed — see the note there. */

/* Browser-native virtualisation for the message list.
 *
 * `content-visibility: auto` lets the engine skip layout, style and paint for
 * any row currently outside the viewport, which is the actual frame-time cost
 * of a long thread — a 600-message chat only ever lays out the dozen rows you
 * can see. Android System WebView is Chromium, so this is supported on the
 * target and degrades to "no optimisation" anywhere it isn't.
 *
 * `contain-intrinsic-size: auto 64px` is the load-bearing half. Without the
 * `auto` keyword every skipped row would claim a flat 64px, so the scrollbar
 * and `scrollHeight` would lurch as rows enter and reveal their true height —
 * which would in turn break useScrollAnchor's prepend restore. `auto` tells
 * the engine to remember each row's last real rendered size and keep using it
 * while skipped, so the scroll metrics stay honest.
 *
 * Chosen over a JS virtual scroller deliberately: a real virtualiser would
 * have to take ownership of scroll position, and this list already has three
 * things driving it (bottom pinning, the prepend anchor, and the top sentinel
 * that triggers history loads). This gets the rendering win without touching
 * any of that. */
.msg-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 64px;
}

/* A shared-sketch bubble is a fixed 160px thumbnail plus caption and timestamp
 * — roughly 232px, versus the 64px a text line takes. Leaving these on the
 * default estimate made `scrollHeight` under-report by ~165px per off-screen
 * media bubble, so "scroll to bottom" on a media-heavy thread landed well short
 * of the newest message. `useScrollAnchor` re-pins until the height settles,
 * which covers the residual error; this keeps that error small to begin with so
 * there is less visible catch-up. */
.msg-row--media {
  contain-intrinsic-size: auto 232px;
}
</style>