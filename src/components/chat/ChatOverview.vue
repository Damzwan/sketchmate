<template>
  <div class="flex flex-col h-full overflow-visible">
    <ChatFriendPicker
      v-if="isCreatingChat"
      :min-chat-version="MIN_CHAT_VERSION"
      @cancel="isCreatingChat = false"
      @select-friend="startChatWithFriend"
    />

    <!-- pt-3: `overflow-y-auto` makes this a scroll container, so it clips at its
         padding box on BOTH axes. The animated text effects lift their glyphs out
         of the layout box (jawbreaker floats to translateY(-8px) and rotates), so
         the "Conversations" heading was shaved off along the top edge whenever it
         sat near it. The padding is the headroom that transform needs. -->
    <div v-else class="animate-fade-in pt-3 pb-20 overflow-y-auto hide-scrollbar overflow-visible">

      <!-- GOOGLE PLAY POLICY: Child Safety Reminder -->
      <div
        v-if="isUnderAge"
        class="mx-1 mb-3 bg-amber-100/90 border border-amber-300/60 p-3 rounded-[1.2rem] flex items-start gap-3 shadow-sm"
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
        class="mb-3"
      />

      <div v-if="onlineMates.length > 0" class="pt-0.5">
        <div class="px-1 mb-1.5 text-[10px] font-black uppercase tracking-widest" :style="{ color: 'var(--chat-widget-desc, rgba(0,0,0,.7))' }">Online Now</div>
        <div class="flex overflow-x-auto hide-scrollbar gap-3.5 px-1 mb-3 overflow-visible">
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
            <span class="text-[10px] font-black truncate w-full text-center uppercase tracking-tight mt-1" :style="{ color: 'var(--chat-widget-name, #18181b)' }">
              {{ friend.name.split(' ')[0] }}
            </span>
          </div>
        </div>
      </div>

      <div class="px-1 mb-2 flex items-center justify-between gap-2">
        <div class="flex items-baseline gap-2 min-w-0">
          <!-- The stacked-shadow effects (jawbreaker/puffy/velvet) paint up to
               ~12px right and ~16px below the glyphs. Reserve that in the span's
               OWN box so the offset layers aren't clipped by the scroll container
               or overlapped by the first conversation row. -->
          <span
            class="text-xl font-normal tracking-tight shrink-0 leading-none"
            :class="[props.fontEffectClass, props.fontEffectClass ? 'pr-3.5 pb-2' : '']"
            :style="{ color: props.fontEffectClass ? undefined : 'var(--chat-widget-name, #18181b)' }"
          >
            Conversations
          </span>

          <!-- Clearing the badge required opening every unread thread one by
               one, which is busywork for a notification dot. Grouped with the
               heading rather than with the chips on the right: it's an action ON
               this list, and the right side is already carrying two controls. -->
          <button
            v-if="chatStore.totalUnreadCount > 0"
            type="button"
            class="shrink-0 text-[10px] font-black uppercase tracking-widest text-secondary underline decoration-secondary/30 underline-offset-4 active:opacity-50 transition cursor-pointer disabled:opacity-40"
            :disabled="markingAllRead"
            @click="readAll"
          >
            Read all
          </button>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            type="button"
            class="h-8 flex items-center gap-1.5 px-3 rounded-full border shadow-sm transition-all active:scale-95 cursor-pointer"
            :style="networkButtonStyle"
            aria-label="Open your network"
            title="Your network"
            @click="openNetwork()"
          >
            <ion-icon :icon="svg(mdiAccountGroupOutline)" class="text-sm" />
            <span class="text-xs font-black uppercase tracking-wide">Network</span>
          </button>
        </div>
      </div>

      <div class="space-y-2 px-0.5">
        <!-- LOADING STATE -->
        <div v-if="showLoadingState" class="space-y-2 pt-1">
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

        <!-- EMPTY STATE — its own component, along with the CTA logic that only
             ever served it. It was ~60 lines of markup and two computeds
             wedged into the middle of the conversation list, which made the
             list itself hard to read. -->
        <ChatOverviewEmptyState
          v-else-if="isEmpty"
          @start-chat="isCreatingChat = true"
        />

        <!-- INVITES & CHATS -->
        <div v-if="inviteCount > 0" class="space-y-2">
          <button
            class="w-full flex items-center gap-1.5 pt-1 pl-1 pr-0.5 disabled:cursor-default cursor-pointer"
            :disabled="inviteCount <= 2"
            @click="invitesExpanded = !invitesExpanded"
          >
            <span class="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse"></span>
            <span class="text-xs font-black text-secondary uppercase tracking-widest">Invites</span>
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
          <div class="text-[10px] font-black uppercase tracking-widest" :style="{ color: 'var(--chat-widget-name, #18181b)' }">Active Chats</div>
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
import { IonFab, IonFabButton, IonIcon } from "@ionic/vue";
import {
	mdiAccountGroupOutline,
	mdiChatPlusOutline,
	mdiChevronDown,
	mdiChevronRight,
	mdiShieldAlertOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";

import LobbyConversationItem from "./LobbyConversationItem.vue";
import ConversationItem from "./ConversationItem.vue";
import ChatFriendPicker from "./ChatFriendPicker.vue";
import ChatOverviewEmptyState from "./ChatOverviewEmptyState.vue";

import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { MIN_CHAT_VERSION } from "@/config/general.config";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { masterAnimation } from "@/helper/animation.helper";
import { useIonRouter } from "@ionic/vue";
import { compareConversationActivity } from "@/helper/chat.helper";

const props = defineProps<{ fontEffectClass?: string }>();
defineEmits(["join-session"]);

const chatWidget = useChatWidgetStore();
const chatStore = useChatStore();
const friendStore = useFriendStore();
const drawSyncer = useDrawSyncer();

const { activeChats, typingStatuses, chatsHydrated } = storeToRefs(chatStore);
const { isExpanded } = storeToRefs(chatWidget);
const { user, isUnderAge } = storeToRefs(useAuthStore());
const { isFriendOnline, pendingRequests, onlineFriends } =
	storeToRefs(friendStore);
const { lobbyChatMessages, roomMembers, invitations } = storeToRefs(drawSyncer);

const isCreatingChat = ref(false);
const isInLobby = computed(() => !!roomMembers.value?.length);
const lobbyUnreadCount = ref(0);

// Genuinely nothing to show — no invites, no threads, not even a live lobby row.
const isEmpty = computed(
	() =>
		fauxInvitations.value.length === 0 &&
		actionableChats.value.length === 0 &&
		regularChats.value.length === 0 &&
		!isInLobby.value,
);

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
	return [...incomingMates, ...incomingChats].sort(compareConversationActivity);
});

const regularChats = computed(() => {
	const actionableIds = new Set(actionableChats.value.map((c) => c._id));
	const all = [
		...activeChats.value.filter((c) => !actionableIds.has(c._id)),
		...pendingRequests.value.filter((c) => c.initiator_id === user.value?._id),
	];
	return all.sort(compareConversationActivity);
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

// Guard the bulk mutation so a double tap cannot race two optimistic clears.
const markingAllRead = ref(false);
const readAll = async () => {
	if (markingAllRead.value) return;
	markingAllRead.value = true;
	try {
		await chatStore.markAllRead();
	} finally {
		markingAllRead.value = false;
	}
};

const router = useIonRouter();

const networkButtonStyle = {
	background: "var(--chat-widget-control-bg, rgba(255,255,255,.72))",
	borderColor: "var(--chat-widget-border, rgba(0,0,0,.12))",
	color: "var(--chat-widget-utility, rgba(0,0,0,.72))",
};

// Leaves the panel first — routing under an open sheet lands the user on a page
// with the chat modal still covering it.
const openNetwork = (tab: "mates" | "followers" | "following" = "mates") => {
	chatWidget.closePanel();
	router.push(`/${FRONTEND_ROUTES.network}?tab=${tab}`, masterAnimation);
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
