<template>
  <div @touchmove.stop class="space-y-3 pb-4 flex flex-col justify-end min-h-full animate-tab-in">

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
          <span class="text-[9px] opacity-40 uppercase tracking-widest font-sans font-black">is blocked</span>
        </h3>
        <div class="mt-6">
          <ion-button color="dark" fill="outline" expand="block" @click="openUserActions(partner)">
            Manage Artist
          </ion-button>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- Empty Conversation Vibe Checklist -->
      <div v-if="isBrandNewChat && partner" class="flex flex-col items-center justify-center py-16 opacity-30 animate-fade-in text-center">
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
      <TransitionGroup name="msg-bubble" tag="div" class="flex flex-col gap-2.5 w-full overflow-visible" :class="{ 'is-fetching-history': isFetchingHistory }">
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

      <!-- Collaborative Drawing Invite Card Notification Block -->
      <div v-if="activeInvite" class="flex justify-center w-full my-4 animate-bounce-in">
        <div class="flex flex-col items-center gap-3 p-4 bg-white border border-secondary/40 rounded-[2.25rem] w-full max-w-[240px] shadow-md relative overflow-hidden">
          <div class="absolute -left-6 -bottom-6 w-16 h-16 rounded-full bg-secondary/10 blur-xl pointer-events-none"></div>
          <button @click="dismissInvite" class="absolute top-2.5 right-2.5 text-black/30 hover:text-black transition-colors">
            <ion-icon :icon="closeCircle" class="text-lg" />
          </button>

          <div class="relative">
            <img :src="activeInvite.friend?.img" class="w-12 h-12 rounded-xl border border-black/5 shadow-sm object-cover" alt="" />
            <div class="absolute -bottom-1 -right-1 bg-secondary rounded-full p-1 border border-white shadow-sm flex items-center justify-center">
              <ion-icon :icon="svg(mdiDraw)" class="text-[9px] text-white" />
            </div>
          </div>

          <div class="text-center px-1">
            <p class="text-[12px] font-bold text-black italic cabin-sketch-regular leading-tight">
              <span class="text-secondary font-black not-italic uppercase text-xs tracking-tight">{{ activeInvite.friend?.name }}</span><br />invited you to draw!
            </p>
          </div>

          <ion-button color="secondary" expand="block" @click="$emit('join-session', activeInvite.roomId)">
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

import { useAuthStore } from "@/store/auth.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useChatStore } from "@/store/chat.store";
import { useFriendStore } from "@/store/friend.store";
import { useIntersectionObserver } from "@vueuse/core";
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

<style scoped>
.animate-tab-in { animation: tabIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
@keyframes tabIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>