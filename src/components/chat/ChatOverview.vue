<template>
  <div class="flex flex-col h-full overflow-visible">
    <ChatFriendPicker
      v-if="isCreatingChat"
      :min-chat-version="MIN_CHAT_VERSION"
      @cancel="isCreatingChat = false"
      @select-friend="startChatWithFriend"
    />

    <div v-else class="animate-fade-in pb-24 overflow-y-auto hide-scrollbar overflow-visible">

      <!-- GOOGLE PLAY POLICY: Child Safety Reminder -->
      <div
        v-if="isUnderAge"
        class="mx-1 mb-4 bg-amber-100/90 border border-amber-300/60 p-3.5 rounded-[1.2rem] flex items-start gap-3 shadow-sm"
      >
        <ion-icon :icon="svg(mdiShieldAlertOutline)" class="text-2xl text-amber-600 shrink-0 mt-0.5" />
        <div class="text-amber-900 leading-tight">
          <p class="text-[10px] font-black uppercase tracking-widest mb-1 opacity-80">Stay Safe Online</p>
          <p class="text-[13px] font-medium opacity-90">Keep your private info private. Never share your real name, school, passwords, or where you live.</p>
        </div>
      </div>

      <LobbyConversationItem
        v-if="isInLobby"
        :unreadCount="lobbyUnreadCount"
        :memberCount="roomMembers.length"
        :lastMessage="lastLobbyMessage"
        @open="chatWidget.openLobby()"
        class="mb-4"
      />

      <div v-if="onlineMates.length > 0" class="pt-0.5">
        <div class="px-1 mb-2 text-[9px] font-black text-black/70 uppercase tracking-widest">Online Now</div>
        <div class="flex overflow-x-auto hide-scrollbar gap-4 px-1 mb-4 overflow-visible">
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

      <div class="px-1 mb-2.5 flex items-center justify-between">
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
        <div v-if="showLoadingState" class="space-y-2.5 pt-1">
          <div
            v-for="i in 4"
            :key="i"
            class="flex items-center gap-3 p-3 rounded-[1.6rem] border border-primary/20 bg-white/60"
          >
            <div class="w-11 h-11 rounded-full bg-black/5 animate-pulse shrink-0"></div>
            <div class="flex-1 min-w-0 space-y-2">
              <div class="h-2.5 w-1/3 rounded-full bg-black/5 animate-pulse"></div>
              <div class="h-2 w-2/3 rounded-full bg-black/5 animate-pulse"></div>
            </div>
          </div>
        </div>

        <div v-else-if="fauxInvitations.length === 0 && actionableChats.length === 0 && regularChats.length === 0 && !isInLobby" class="px-1">
          <!-- PRIMARY CTA -->
          <button
            class="w-full bg-secondary text-white rounded-[2rem] p-6 flex flex-col items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-all mb-4"
            @click="primaryCta.action"
          >
            <ion-icon :icon="svg(primaryCta.icon)" class="text-5xl opacity-90" />
            <div class="text-center">
              <span class="block font-black text-2xl cabin-sketch-regular tracking-tight leading-none mb-1">{{ primaryCta.label }}</span>
              <span class="block text-[13px] font-medium opacity-90 leading-tight">{{ primaryCta.sub }}</span>
            </div>
          </button>

          <!-- SECONDARY CTAs -->
          <div v-if="secondaryCtas.length > 0">
            <div class="flex items-center gap-3 mb-3 mt-1">
              <div class="h-px bg-primary/20 flex-1"></div>
              <span class="text-[9px] font-black text-black/40 uppercase tracking-widest">{{ hasMates ? 'Or explore' : 'Connect with others' }}</span>
              <div class="h-px bg-primary/20 flex-1"></div>
            </div>

            <div class="grid gap-2.5" :class="secondaryCtas.length > 1 ? 'grid-cols-2' : 'grid-cols-1'">
              <button
                v-for="cta in secondaryCtas"
                :key="cta.label"
                class="bg-white border border-primary/20 rounded-[1.2rem] p-3.5 shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center gap-2 text-center"
                @click="cta.action"
              >
                <div class="w-11 h-11 rounded-full bg-secondary/10 flex items-center justify-center shrink-0">
                  <ion-icon :icon="svg(cta.icon)" class="text-xl text-secondary" />
                </div>
                <div>
                  <span class="block text-[14px] font-black text-black cabin-sketch-regular leading-tight">{{ cta.label }}</span>
                  <span class="block text-[11px] text-black/60 font-medium mt-1 leading-tight">{{ cta.sub }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div v-if="inviteCount > 0" class="space-y-2.5">
          <button
            class="w-full flex items-center gap-1.5 pt-1 pl-1 pr-0.5 disabled:cursor-default"
            :disabled="inviteCount <= 2"
            @click="invitesExpanded = !invitesExpanded"
          >
            <span class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></span>
            <span class="text-[9px] font-black text-secondary uppercase tracking-widest">Invites</span>
            <span class="min-w-[14px] h-3.5 px-1 rounded-full bg-secondary/15 text-secondary text-[8px] font-black flex items-center justify-center">
              {{ inviteCount }}
            </span>
            <ion-icon
              v-if="inviteCount > 2"
              :icon="svg(showInvites ? mdiChevronDown : mdiChevronRight)"
              class="ml-auto text-secondary/70 text-base"
            />
          </button>

          <template v-if="showInvites">
            <ConversationItem
              v-for="chat in fauxInvitations"
              :key="'live-' + chat._id"
              :chat="chat"
              :currentUserId="user?._id || ''"
              :isOnline="true"
              :isTyping="false"
              @open="$emit('join-session', chat._id)"
            />

            <ConversationItem
              v-for="chat in actionableChats"
              :key="'action-' + chat._id"
              :chat="chat"
              :currentUserId="user?._id || ''"
              :isOnline="isFriendOnline(getPartnerIdFromChat(chat))"
              :isTyping="typingStatuses[getPartnerIdFromChat(chat)] || false"
              @open="chatWidget.openPrivateChat(chat._id)"
            />
          </template>
        </div>

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
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { IonFab, IonFabButton, IonIcon, useIonRouter } from "@ionic/vue";
import {
	mdiAccountMultiplePlusOutline,
	mdiAccountSearchOutline,
	mdiBalloon,
	mdiChatPlusOutline,
	mdiChevronDown,
	mdiChevronRight,
	mdiHeart,
	mdiPencilPlusOutline,
	mdiShieldAlertOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";

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

const { activeChats, typingStatuses, chatsHydrated } = storeToRefs(chatStore);
const { isExpanded } = storeToRefs(chatWidget);
const { user, isUnderAge } = storeToRefs(useAuthStore());
const { isFriendOnline, pendingRequests, onlineFriends } =
	storeToRefs(friendStore);
const { lobbyChatMessages, roomMembers, invitations } = storeToRefs(drawSyncer);

const router = useIonRouter();
const { openMenu } = useMenuStore();

const isCreatingChat = ref(false);
const isInLobby = computed(() => !!roomMembers.value?.length);
const lobbyUnreadCount = ref(0);

// Proxy for having existing mates
const hasMates = computed(() => quotaStore.mates.used > 0);

watch(isExpanded, (open) => {
	if (!open) isCreatingChat.value = false;
});

const invitesExpanded = ref(false);
const inviteCount = computed(
	() => fauxInvitations.value.length + actionableChats.value.length,
);
const showInvites = computed(
	() => invitesExpanded.value || inviteCount.value <= 2,
);
const showLoadingState = computed(
	() =>
		!chatsHydrated.value &&
		activeChats.value.length === 0 &&
		pendingRequests.value.length === 0,
);

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

const handleQuotaPillClick = () => {
	if (quotaStore.canAddMate || quotaStore.isPro) return;
	chatWidget.closePanel();
	openMenu(Menu.Shop);
};

// Dynamic Primary CTA
const primaryCta = computed(() => {
	if (hasMates.value) {
		return {
			icon: mdiAccountSearchOutline,
			label: "Message a mate",
			sub: "Start a chat with someone you know",
			action: () => {
				isCreatingChat.value = true;
			},
		};
	}
	return {
		icon: mdiAccountMultiplePlusOutline,
		label: "Add a mate",
		sub: "Share or scan a friend code",
		action: () => {
			chatWidget.closePanel();
			openMenu(Menu.ConnectionMenu);
		},
	};
});

// Dynamic Secondary CTAs
const secondaryCtas = computed(() => {
	const ctas = [];

	// If they have mates, "Add a mate" moves down here to secondary
	if (hasMates.value) {
		ctas.push({
			icon: mdiAccountMultiplePlusOutline,
			label: "Add Mate",
			sub: "Scan a code",
			action: () => {
				chatWidget.closePanel();
				openMenu(Menu.ConnectionMenu);
			},
		});
	}

	// Only push stranger interactions if they are strictly allowed (over 13)
	if (!isUnderAge.value) {
		ctas.push({
			icon: mdiPencilPlusOutline,
			label: "Public Lobby",
			sub: "Draw together",
			action: () => {
				chatWidget.closePanel();
				router.push(
					{ path: FRONTEND_ROUTES.draw, query: { together: "true" } },
					masterAnimation,
				);
			},
		});
		ctas.push({
			icon: mdiBalloon,
			label: "Balloons",
			sub: "Send to a stranger",
			action: () => {
				chatWidget.closePanel();
				openMenu(Menu.BalloonMenu);
			},
		});
	}

	return ctas;
});
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