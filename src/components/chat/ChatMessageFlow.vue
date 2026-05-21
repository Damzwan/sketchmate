<!-- components/chat/ChatMessageFlow.vue -->
<template>
  <div @touchmove.stop class="space-y-2 pb-4 flex flex-col justify-end min-h-full animate-tab-in">

    <!-- 0. BLOCKED STATE -->
    <div v-if="isBlocked" class="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
      <div class="bg-white/40 border border-white/60 p-8 rounded-[3rem] backdrop-blur-md shadow-xl text-center w-full max-w-xs">
        <div class="relative inline-block mb-4">
          <img :src="partner?.img" class="w-20 h-20 rounded-[2rem] border-4 border-white shadow-md object-cover grayscale opacity-60" />
          <div class="absolute -bottom-1 -right-1 bg-zinc-500 rounded-full p-2 border-2 border-white shadow-sm">
            <ion-icon :icon="svg(mdiAccountOff)" class="text-xs text-white" />
          </div>
        </div>
        <h3 class="text-xl font-black text-black leading-tight cabin-sketch-regular">
          {{ partner?.name }} <br />
          <span class="text-[10px] opacity-40 uppercase tracking-widest font-sans font-bold">is blocked</span>
        </h3>
        <ion-button color="dark" fill="outline" class="mt-8 font-black text-[10px] tracking-widest custom-rounded-button w-full" @click="openUserActions(partner)">
          Manage Artist
        </ion-button>
      </div>
    </div>

    <!-- ACTIVE CONTENT -->
    <template v-else>

      <!-- NEW CHAT BLANK STATE -->
      <div v-if="isBrandNewChat && partner" class="flex flex-col items-center justify-center py-20 opacity-40 animate-fade-in text-center">
        <ion-icon :icon="svg(mdiChatOutline)" class="text-6xl mb-4 text-black" />
        <p class="cabin-sketch-regular text-2xl font-bold text-black leading-none">
          Say hi to <br />{{ partner.name }}!
        </p>
      </div>

      <!-- LOADING SPINNER -->
      <div v-if="activeTab !== 'lobby' && messages.length > 0 && chatStore.hasMoreMessagesByChat[activeTab] !== false" ref="topSentinel" class="w-full flex justify-center py-4 shrink-0">
        <ion-spinner name="bubbles" color="secondary" class="opacity-60"></ion-spinner>
      </div>

      <!-- 1. MESSAGE BUBBLES -->
      <TransitionGroup name="msg-bubble" tag="div" class="flex flex-col gap-2 w-full" :class="{ 'is-fetching-history': isFetchingHistory }">
        <ChatMessageBubble
          v-for="(msg, index) in messages"
          :key="msg.localKey || msg._id || index"
          :msg="msg"
          :partner="partner"
          :activeTab="activeTab"
          :isMe="isMe(msg)"
          :isCompact="isCompact(msg, index)"
          :class="{ 'skip-anim': msg.isOptimistic !== true || isFetchingHistory}"
          @inspect-profile="(ev, info) => $emit('inspect-profile', ev, info)"
        />
      </TransitionGroup>

      <!-- 2. UNIFIED RELATIONSHIP STATUS BANNER -->
      <ChatRelationshipBanner
        v-if="showRelationshipBanner && partner"
        :chat="currentChat"
        :partner="partner"
        :currentUserId="user?._id"
        @accept-invite="chatStore.respondToRequest(currentChat._id, 'accept')"
        @decline-invite="chatStore.respondToRequest(currentChat._id, 'decline')"
        @request="handleMateRequest"
        @accept="handleMateAccept"
        @decline="handleMateDecline"
        @cancel-mate="chatStore.handleCancelMateRequest(currentChat._id)"
      />

      <!-- 3. DRAWING INVITATION BANNER -->
      <div v-if="activeInvite" class="flex justify-center w-full my-6 animate-bounce-in">
        <div class="flex flex-col items-center gap-3 p-4 bg-secondary/10 border border-secondary/30 rounded-[2.5rem] backdrop-blur-md w-full max-w-[250px] shadow-2xl relative">
          <button @click="dismissInvite" class="absolute top-3 right-3 text-secondary/40 hover:text-secondary"><ion-icon :icon="closeCircle" class="text-xl" /></button>
          <div class="relative">
            <img :src="activeInvite.friend?.img" class="w-14 h-14 rounded-2xl border-2 border-white shadow-md object-cover" />
            <div class="absolute -bottom-1 -right-1 bg-secondary rounded-full p-1.5 border-2 border-white shadow-sm">
              <ion-icon :icon="svg(mdiDraw)" class="text-xs text-white" />
            </div>
          </div>
          <div class="text-center">
            <p class="text-[13px] font-bold text-black italic cabin-sketch-regular leading-tight">
              <span class="text-secondary font-black not-italic uppercase text-sm">{{ activeInvite.friend?.name }}</span><br />invited you to draw!
            </p>
          </div>
          <ion-button color="secondary" expand="block" class="w-full font-black text-[11px] tracking-widest custom-rounded-button" @click="$emit('join-session', activeInvite.roomId)">
            Join Session
          </ion-button>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { IonButton, IonIcon, IonSpinner } from "@ionic/vue";
import { closeCircle } from "ionicons/icons";
import { mdiAccountOff, mdiChatOutline, mdiDraw } from "@mdi/js";
import { svg } from "@/helper/general.helper";

import ChatMessageBubble from "./ChatMessageBubble.vue";
import ChatRelationshipBanner from "./ChatRelationshipBanner.vue";

import { useAuthStore } from "@/store/auth.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useChatStore } from "@/store/chat.store";
import { useFriendStore } from "@/store/friend.store";
import { PopulatedConversation } from "@/types/server.types";
import { useIntersectionObserver } from "@vueuse/core";
import {
	acceptMatership,
	declineMatership,
	requestMatership,
} from "@/service/api/relationship.api";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";

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

const showRelationshipBanner = computed(() => {
	if (!currentChat.value) return false;
	const s = currentChat.value.status;
	return ["pending_invite", "temporary", "pending_mate", "expired"].includes(
		s as string,
	);
});

async function handleMateRequest() {
	if (!currentChat.value?.relationship_id) return;
	try {
		await requestMatership(currentChat.value._id);
		const idx = chatStore.activeChats.findIndex(
			(c) => c._id === currentChat.value!._id,
		);
		if (idx !== -1)
			chatStore.activeChats[idx] = {
				...chatStore.activeChats[idx],
				status: "pending_mate",
				initiator_id: user.value?._id?.toString(),
			};
	} catch (e) {
		console.error(e);
	}
}

async function handleMateAccept() {
	if (!currentChat.value?.relationship_id) return;
	try {
		const { conversation } = (await acceptMatership(
			currentChat.value.relationship_id,
		)) as { conversation: PopulatedConversation };
		chatStore.handleMateMatched({ conversation });
	} catch (e) {
		console.error(e);
	}
}

async function handleMateDecline() {
	if (!currentChat.value?.relationship_id) return;
	try {
		const { status } = (await declineMatership(
			currentChat.value.relationship_id,
		)) as any;
		const idx = chatStore.activeChats.findIndex(
			(c) => c._id === currentChat.value!._id,
		);
		if (idx !== -1)
			chatStore.activeChats[idx] = {
				...chatStore.activeChats[idx],
				status,
				initiator_id: undefined,
			};
	} catch (e) {
		console.error(e);
	}
}

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