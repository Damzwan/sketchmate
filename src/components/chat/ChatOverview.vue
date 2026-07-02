<template>
  <div class="flex flex-col h-full overflow-visible">
    <ChatFriendPicker
      v-if="isCreatingChat"
      :friends="friendStore.networkLists.mates"
      :min-chat-version="MIN_CHAT_VERSION"
      :is-friend-online="isFriendOnline"
      @cancel="isCreatingChat = false"
      @select-friend="startChatWithFriend"
    />

    <div v-else class="animate-fade-in pb-24 overflow-y-auto hide-scrollbar overflow-visible">
      <LobbyConversationItem
        v-if="isInLobby"
        :unreadCount="lobbyUnreadCount"
        :memberCount="roomMembers.length"
        :lastMessage="lastLobbyMessage"
        @open="chatWidget.openLobby()"
        class="mb-4"
      />

      <div v-if="onlineMates.length > 0" class="pt-1">
        <div class="px-1 mb-2.5 text-[9px] font-black text-black uppercase tracking-widest">Online Now</div>
        <div class="flex overflow-x-auto hide-scrollbar gap-4 px-1 mb-5 overflow-visible">
          <div
            v-for="friend in onlineMates"
            :key="friend._id"
            @click="startChatWithFriend(friend)"
            class="flex flex-col items-center shrink-0 w-12 cursor-pointer group"
          >
            <div class="relative flex items-center justify-center transition-transform duration-300 group-hover:scale-105 active:scale-90">
              <UserAvatar
                static
                :user="friend"
                :customization="friend.customization"
                size="sm"
              />
              <div class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white z-20 shadow-sm"></div>
            </div>
            <span class="text-[9px] font-black text-black/80 truncate w-full text-center uppercase tracking-tight mt-1">
              {{ friend.name.split(' ')[0] }}
            </span>
          </div>
        </div>
      </div>

      <div class="px-1 mb-3.5 flex items-center justify-between">
        <span class="text-xl font-normal cabin-sketch-regular text-black tracking-tight">
          Conversations
        </span>

        <div
          v-if="quotaStore.mates.limit > 0"
          class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border shadow-sm transition-all active:scale-95 cursor-pointer"
          :class="!quotaStore.canAddMate && !quotaStore.isPro
            ? 'bg-amber-500 border-amber-500 text-white'
            : 'bg-white/80 border-primary/40 text-black/50'"
          @click="handleQuotaPillClick"
        >
          <ion-icon :icon="svg(mdiHeart)" class="text-[9px]" :class="!quotaStore.canAddMate && !quotaStore.isPro ? 'text-white' : 'text-black/30'" />
          <span class="text-[9px] font-black uppercase tracking-widest mt-[0.5px]">
            {{ quotaStore.mates.used }}/{{ quotaStore.mates.limit }} Mates
          </span>
        </div>
      </div>

      <div class="space-y-2.5 px-0.5">
        <div v-if="fauxInvitations.length === 0 && actionableChats.length === 0 && regularChats.length === 0 && !isInLobby"
             class="p-8 text-center bg-white/40 rounded-[2rem] border border-dashed border-primary/60">
          <p class="cabin-sketch-regular text-base font-bold text-black/70 leading-snug">
            Your drawing desk is clear!
          </p>
          <p class="text-[9px] uppercase tracking-widest text-black/50 mt-0.5">
            Send a canvas balloon to find an artist mate
          </p>
        </div>

        <ConversationItem
          v-for="chat in fauxInvitations"
          :key="'live-' + chat._id"
          :chat="chat"
          :currentUserId="user?._id || ''"
          :isOnline="true"
          :isTyping="false"
          @open="$emit('join-session', chat._id)"
        />

        <div v-if="actionableChats.length > 0" class="flex items-center gap-1.5 pt-2 pb-0.5 pl-1 animate-fade-in">
          <span class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></span>
          <div class="text-[9px] font-black text-secondary uppercase tracking-widest">Action Required</div>
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

        <div v-if="(fauxInvitations.length > 0 || actionableChats.length > 0) && regularChats.length > 0" class="pt-2 pb-0.5 pl-1">
          <div class="text-[9px] font-black text-black uppercase tracking-widest">Active Chats</div>
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

    <ion-fab v-show="!isCreatingChat" slot="fixed" vertical="bottom" horizontal="end" class="absolute bottom-6 right-2">
      <ion-fab-button color="secondary" @click="isCreatingChat = true">
        <ion-icon :icon="svg(mdiChatPlusOutline)" class="text-xl text-white" />
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

const fauxInvitations = computed(() => {
	return invitations.value.map((invite) => ({
		_id: invite.roomId,
		status: "live_invite",
		participants: [user.value, invite.friend],
		updatedAt: new Date().toISOString(),
		unread_counts: { [user.value?._id || ""]: 1 },
	})) as any[];
});

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
.hide-scrollbar::-webkit-scrollbar { display: none !important; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.animate-fade-in { animation: fadeIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>