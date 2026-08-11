<template>
  <!-- pb-1, not pb-4. This padding stacked with the scroller's own bottom
       padding and the composer's top padding, so the last bubble sat ~40px
       clear of the input bar — the thread read as detached from the composer
       rather than continuous with it. -->
  <div
    @touchmove.stop
    @pointerdown="messageActions.onPointerDown"
    @pointermove="messageActions.onPointerMove"
    @pointerup="messageActions.onPointerUp"
    @pointercancel="messageActions.onPointerCancel"
    class="space-y-3 pb-1 flex flex-col justify-end min-h-full animate-tab-in"
  >

    <!-- Blocked User Interface Callout Box -->
    <div v-if="isBlocked" class="flex-1 flex flex-col items-center justify-center p-6 animate-fade-in">
      <div class="bg-white border border-primary/50 p-6 rounded-[2.5rem] shadow-sm text-center w-full max-w-xs relative overflow-hidden">
        <div class="absolute -right-4 -bottom-4 w-16 h-16 rounded-full bg-primary/10 blur-xl pointer-events-none"></div>
        <div class="relative inline-block mb-3.5">
          <img :src="partner?.img" class="w-16 h-16 rounded-[1.35rem] border border-black/5 shadow-sm object-cover grayscale opacity-50" alt="" />
          <div class="absolute -bottom-1 -right-1 bg-zinc-500 rounded-full p-1 border border-white shadow-sm flex items-center justify-center">
            <ion-icon :icon="svg(mdiAccountOff)" class="text-[9px] text-white" />
          </div>
        </div>
        <h3 class="text-base font-black text-black leading-tight cabin-sketch-regular">
          {{ partner?.name }}<br />
          <span class="text-xs text-black/80 uppercase tracking-widest font-sans font-black">is blocked</span>
        </h3>
        <div class="mt-6">
          <ion-button color="dark" fill="outline" expand="block" @click="partner && openUserActions(partner)">
            Manage Artist
          </ion-button>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- Empty Conversation Vibe Checklist -->
      <div v-if="isBrandNewChat && partner" class="flex flex-col items-center justify-center py-16 opacity-80 animate-fade-in text-center">
        <ion-icon :icon="svg(mdiChatOutline)" class="text-5xl mb-3 text-black" />
        <p class="cabin-sketch-regular text-xl font-bold text-black leading-none">
          Say hi to<br />{{ partner.name }}!
        </p>
      </div>

      <!-- History Loading Spinner Element Indicator -->
      <div v-if="activeTab !== 'lobby' && messages.length > 0 && chatStore.hasMoreMessagesByChat[activeTab] !== false" ref="topSentinel" class="w-full flex justify-center py-2 shrink-0">
        <ion-spinner name="dots" color="secondary" class="opacity-40"></ion-spinner>
      </div>

      <!-- Main Message Stream Content Node -->
      <!-- Plain div, NOT a TransitionGroup. TransitionGroup runs FLIP: on every
           insert it reads getBoundingClientRect() for every child, so one
           arriving message forced a full layout read across the whole thread —
           O(n) synchronous reflows per message, which is what made a long chat
           crawl. Only the message that just arrived needs to animate, and it can
           do that with a plain CSS keyframe on mount.

           Do NOT add `v-memo` here. Its cache is POSITIONAL (indexed into the
           component's renderCache), and this list is not positionally stable:
           `handleLoadMore` prepends older history, and switching conversations
           swaps in a different-length array on the same reused component
           instance. Either one leaves the cache pointing at slots that no
           longer exist, and the patch crashes on an undefined vnode
           ("Cannot read properties of undefined (reading 'el')"). -->
      <div class="flex flex-col gap-2.5 w-full overflow-visible">
        <ChatMessageBubble
          v-for="(msg, index) in messages"
          :key="msg.localKey || msg._id || index"
          :msg="msg"
          :partner="partner"
          :activeTab="activeTab"
          :isMe="isMe(msg)"
          :isCompact="isCompact(msg, index)"
          :class="{ 'msg-pop-in': msg.isOptimistic === true && !isFetchingHistory }"
          @inspect-profile="onInspectProfile"
        />
      </div>

      <!-- Collaborative drawing invite. Full width like every other decision
           surface in the thread — the old card was clamped to max-w-[240px],
           which left it floating in the middle of the panel instead of sitting
           in the conversation. -->
      <div v-if="activeInvite" class="w-full my-4 px-1">
        <ChatDrawInviteCard
          :invite="activeInvite"
          @join="$emit('join-session', $event)"
          @dismiss="dismissInvite"
          @inspect-profile="openUserActions"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonSpinner } from "@ionic/vue";
import { mdiAccountOff, mdiChatOutline } from "@mdi/js";
import { useIntersectionObserver } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import ChatDrawInviteCard from "@/components/chat/ChatDrawInviteCard.vue";
import { useMessageActions } from "@/composables/chat/useMessageActions";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useFriendStore } from "@/store/friend.store";
import ChatMessageBubble from "./ChatMessageBubble.vue";

const props = defineProps<{ messages: any[]; isFetchingHistory: boolean }>();
const emit = defineEmits(["inspect-profile", "join-session", "load-more"]);

const authStore = useAuthStore();
const chatWidgetStore = useChatWidgetStore();
const chatStore = useChatStore();
const friendStore = useFriendStore();
const drawSyncer = useDrawSyncer();
const { openUserActions } = useUserContextSheet();

const { user } = storeToRefs(authStore);
const { activeTab } = storeToRefs(chatWidgetStore);
const { invitations } = storeToRefs(drawSyncer);
const { activeChats } = storeToRefs(chatStore);
const { pendingRequests } = storeToRefs(friendStore);

const topSentinel = ref<HTMLElement | null>(null);

// One long-press handler for the whole thread, not one per bubble — see the
// composable's header for why that matters on this list.
const messageActions = useMessageActions({
	messages: () => props.messages,
	currentUserId: () => user.value?._id,
	isLobby: () => activeTab.value === "lobby",
});

useIntersectionObserver(
	topSentinel,
	([{ isIntersecting }]) => {
		if (
			isIntersecting &&
			activeTab.value !== "lobby" &&
			chatStore.hasMoreMessagesByChat[activeTab.value] !== false
		) {
			emit("load-more");
		}
	},
	{ rootMargin: "150px" },
);

const currentChat = computed(() =>
	[...activeChats.value, ...pendingRequests.value].find(
		(c) => c._id === activeTab.value,
	),
);

const partner = computed(() => {
	if (activeTab.value === "lobby") return null;
	const chatPartner = currentChat.value?.participants.find(
		(p: any) => p._id !== user.value?._id,
	);
	if (chatPartner) return chatPartner;
	return friendStore.resolvePartnerInfo(activeTab.value);
});

const isBrandNewChat = computed(
	() => !currentChat.value && activeTab.value !== "lobby",
);
const isBlocked = computed(() =>
	partner.value ? friendStore.isBlocked(partner.value._id) : false,
);

const activeInvite = computed(() => {
	if (activeTab.value === "lobby" || activeTab.value === "overview")
		return null;
	let friendId = activeTab.value;
	if (currentChat.value) {
		const p = currentChat.value.participants.find(
			(p) => p._id !== user.value?._id,
		);
		if (p) friendId = p._id;
	}
	return invitations.value.find((inv) => inv.friend._id === friendId);
});

const dismissInvite = () => {
	if (!activeInvite.value) return;
	drawSyncer.invitations = invitations.value.filter(
		(inv) => inv.roomId !== activeInvite.value?.roomId,
	);
};

// Hoisted, NOT an inline arrow in the template. An inline handler is a fresh
// function identity on every parent render, which counts as a changed prop on
// every bubble — that alone forces all N children to re-render whenever the
// list changes. With this stable and `msg` objects markRaw'd in the store (so
// their references are stable too), Vue's own `shouldUpdateComponent` bailout
// skips re-rendering every bubble whose data didn't actually move. That is the
// win `v-memo` was reaching for, without v-memo's positional cache — which
// crashes on a list that prepends history.
const onInspectProfile = (ev: Event, info: any) =>
	emit("inspect-profile", ev, info);

const isMe = (msg: any) =>
	msg.sender_id === user.value?._id || msg.member?._id === user.value?._id;
const isCompact = (msg: any, index: number) => {
	if (index === 0) return false;
	const prev = props.messages[index - 1];
	const currentSender = msg.sender_id || msg.member?._id;
	const prevSender = prev.sender_id || prev.member?._id;
	return (
		currentSender === prevSender &&
		prev.type !== "join" &&
		prev.type !== "leave"
	);
};
</script>

<style scoped>
/* Replaces the TransitionGroup enter animation. Runs once on mount, on the one
   bubble that was just sent — no FLIP pass over the rest of the thread. */
.msg-pop-in { animation: msgPopIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
@keyframes msgPopIn {
  from { opacity: 0; transform: scale(0.9) translateY(8px); }
  to { opacity: 1; transform: none; }
}

.animate-tab-in { animation: tabIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
@keyframes tabIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
