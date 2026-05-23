<!-- components/chat/ChatOverview.vue -->
<template>
  <div class="flex flex-col h-full">

    <ChatFriendPicker
      v-if="isCreatingChat"
      :friends="friendStore.networkLists.mates"
      :min-chat-version="MIN_CHAT_VERSION"
      :is-friend-online="isFriendOnline"
      @cancel="isCreatingChat = false"
      @select-friend="startChatWithFriend"
    />

    <div v-else class="animate-fade-in pb-24 overflow-y-auto hide-scrollbar">

      <LobbyConversationItem
        v-if="isInLobby"
        :unreadCount="lobbyUnreadCount"
        :memberCount="roomMembers.length"
        :lastMessage="lastLobbyMessage"
        @open="chatWidget.openLobby()"
      />

      <div v-if="onlineMates.length > 0" class="pt-2">
        <div class="px-2 mb-3 text-[10px] font-black text-black/40 uppercase">Online Now</div>
        <div class="flex overflow-x-auto hide-scrollbar gap-4 px-2 mb-6">
          <div v-for="friend in onlineMates" :key="friend._id" @click="startChatWithFriend(friend)"
               class="flex flex-col items-center shrink-0 w-14 cursor-pointer">

            <div class="relative flex items-center justify-center transition-transform active:scale-90">
              <UserAvatar
                static
                :user="friend"
                :customization="friend.customization"
                size="sm"
                class="my-2"
              />

              <div class="absolute -bottom-0.5 right-0 w-3.5 h-3.5 bg-green-400 rounded-full border-2 border-white z-20"></div>
            </div>

            <span class="text-[9px] font-black text-black/80 truncate w-full text-center uppercase tracking-tighter mt-1.5">
        {{ friend.name.split(' ')[0] }}
      </span>
          </div>
        </div>
      </div>

      <div class="px-2 mb-4 flex items-center justify-between">
        <span class="text-2xl font-normal cabin-sketch-regular text-black">
          Conversations
        </span>

        <div
          v-if="quotaStore.mates.limit > 0"
          class="flex items-center gap-1.5 px-2.5 py-1 rounded-full transition-colors active:scale-95 cursor-pointer"
          :class="!quotaStore.canAddMate && !quotaStore.isPro ? 'bg-amber-400/20 border border-amber-400/40' : 'bg-black/5'"
          @click="handleQuotaPillClick"
        >
          <ion-icon :icon="svg(mdiHeart)" class="text-[10px]" :class="!quotaStore.canAddMate && !quotaStore.isPro ? 'text-amber-600' : 'text-black/40'" />
          <span class="text-[10px] font-black uppercase tracking-widest" :class="!quotaStore.canAddMate && !quotaStore.isPro ? 'text-amber-700' : 'text-black/50'">
            {{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }}
          </span>
        </div>
      </div>

      <div class="space-y-2 px-2">
        <!-- EMPTY STATE -->
        <div v-if="fauxInvitations.length === 0 && actionableChats.length === 0 && regularChats.length === 0 && !isInLobby"
             class="p-10 text-center bg-black/5 rounded-[2rem] border border-dashed border-black/10">
          <p class="text-[11px] font-bold text-black/20 italic uppercase tracking-widest leading-relaxed">
            Your sketchbook is empty.<br />Send a balloon to find a mate!
          </p>
        </div>

        <!-- 1. LIVE DRAWING INVITES (Absolute Top Priority) -->
        <ConversationItem
          v-for="chat in fauxInvitations"
          :key="'live-' + chat._id"
          :chat="chat"
          :currentUserId="user?._id || ''"
          :isOnline="true"
          :isTyping="false"
          @open="$emit('join-session', chat._id)"
        />

        <!-- 2. ACTION REQUIRED (Mate Proposals & Incoming Invites) -->
        <div v-if="actionableChats.length > 0" class="flex items-center gap-2 pt-2 pb-1 pl-1 animate-fade-in">
          <div class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></div>
          <div class="text-[10px] font-black text-secondary uppercase tracking-widest">Action Required</div>
        </div>

        <ConversationItem
          v-for="chat in actionableChats"
          :key="'action-' + chat._id"
          :chat="chat"
          :currentUserId="user?._id || ''"
          :isOnline="isFriendOnline(getPartnerIdFromChat(chat))"
          :isTyping="typingStatuses[getPartnerIdFromChat(chat)] || false"
          @open="chatWidget.openPrivateChat(chat._id)"
        />

        <!-- 3. REGULAR CONVERSATIONS -->
        <div v-if="(fauxInvitations.length > 0 || actionableChats.length > 0) && regularChats.length > 0" class="pt-3 pb-1 pl-1">
          <div class="text-[10px] font-black text-black/40 uppercase tracking-widest">Active Chats</div>
        </div>

        <ConversationItem
          v-for="chat in regularChats"
          :key="'reg-' + chat._id"
          :chat="chat"
          :currentUserId="user?._id || ''"
          :isOnline="isFriendOnline(getPartnerIdFromChat(chat))"
          :isTyping="typingStatuses[getPartnerIdFromChat(chat)] || false"
          @open="chatWidget.openPrivateChat(chat._id)"
        />
      </div>
    </div>

    <!-- FLOATING ACTION BUTTON -->
    <ion-fab v-show="!isCreatingChat" slot="fixed" vertical="bottom" horizontal="end" class="absolute bottom-6 right-2">
      <ion-fab-button color="secondary" @click="isCreatingChat = true" class="shadow-none">
        <ion-icon :icon="svg(mdiChatPlusOutline)" class="text-2xl text-white" />
      </ion-fab-button>
    </ion-fab>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { IonFab, IonFabButton, IonIcon } from "@ionic/vue";
import { mdiChatPlusOutline, mdiHeart } from "@mdi/js";
import { svg } from "@/helper/general.helper";

import LobbyConversationItem from "./LobbyConversationItem.vue";
import ConversationItem from "./ConversationItem.vue";
import ChatFriendPicker from "./ChatFriendPicker.vue";

import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { MIN_CHAT_VERSION } from "@/config/general.config";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useQuotaStore } from "@/store/quota.store";

defineEmits(["join-session"]);

const chatWidget = useChatWidgetStore();
const chatStore = useChatStore();
const friendStore = useFriendStore();
const drawSyncer = useDrawSyncer();
const quotaStore = useQuotaStore();

const { activeChats, typingStatuses } = storeToRefs(chatStore);
const { user } = storeToRefs(useAuthStore());
const { isFriendOnline, pendingRequests, onlineFriends } =
	storeToRefs(friendStore);
const { lobbyChatMessages, roomMembers, invitations } = storeToRefs(drawSyncer);

const isCreatingChat = ref(false);
const isInLobby = computed(() => !!roomMembers.value?.length);
const lobbyUnreadCount = ref(0);

// Map actual Drawing Invitations into faux Chat objects so ConversationItem can render them natively
const fauxInvitations = computed(() => {
	return invitations.value.map((invite) => ({
		_id: invite.roomId, // Binds securely to @open -> $emit('join-session', _id)
		status: "live_invite", // Triggers custom UI state in ConversationItem
		participants: [user.value, invite.friend],
		updatedAt: new Date().toISOString(),
		unread_counts: { [user.value?._id || ""]: 1 }, // Triggers unread boldness
	})) as any[];
});

// High priority items requiring user interaction (Proposals + Incoming Chat Requests)
const actionableChats = computed(() => {
	const me = user.value?._id;
	const incomingMates = activeChats.value.filter(
		(c) => c.status === "pending_mate" && c.initiator_id !== me,
	);
	const incomingChats = pendingRequests.value.filter(
		(c) => c.initiator_id !== me,
	);

	return [...incomingMates, ...incomingChats].sort(
		(a, b) =>
			new Date(b.updatedAt || 0).getTime() -
			new Date(a.updatedAt || 0).getTime(),
	);
});

// All remaining active and outgoing chats
const regularChats = computed(() => {
	const actionableIds = new Set(actionableChats.value.map((c) => c._id));
	const all = [
		...activeChats.value.filter((c) => !actionableIds.has(c._id)),
		...pendingRequests.value.filter((c) => c.initiator_id === user.value?._id),
	];
	return all.sort(
		(a, b) =>
			new Date(b.updatedAt || 0).getTime() -
			new Date(a.updatedAt || 0).getTime(),
	);
});

const onlineMates = computed(() => {
	return onlineFriends.value.filter(
		(friend) =>
			friend.chat_status === "mate" || friend.chat_status === "temporary",
	);
});

const lastLobbyMessage = computed(() => {
	const lastChatMessage = lobbyChatMessages.value.findLast(
		(item) => item.type === "message",
	);
	return lastChatMessage?.type === "message"
		? lastChatMessage.message
		: undefined;
});

const getPartner = (chat: any) =>
	chat?.participants?.find((p: any) => p._id !== user.value?._id);
const getPartnerIdFromChat = (chat: any) => getPartner(chat)?._id || "";

const startChatWithFriend = (friend: any) => {
	chatWidget.openChatWithUser(friend._id);
	isCreatingChat.value = false;
};
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.animate-fade-in { animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.pb-24 { padding-bottom: 6rem; }
</style>