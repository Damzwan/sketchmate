<template>
  <ChatToasts />

  <ion-modal
    :is-open="isVisible && isExpanded"
    @will-present="scrollToBottom(true)"
    @did-dismiss="chatWidget.closePanel()"
    :keepContentsMounted="true"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    class="liquid-chat-modal"
  >
    <div class="flex flex-col h-full bg-tertiary backdrop-blur-2xl relative">

      <ChatTabsHeader />

      <ChatToolbar
        @inspect-profile="(_: any ,info: any) => openUserActions(info)"
        @open-report="openUserActions"
      />

      <div
        @scroll="onScroll"
        @touchmove.stop
        class="flex-1 overflow-y-auto relative hide-scrollbar px-4 py-3"
        ref="messageContainer"
      >
        <ChatOverview
          v-if="activeTab === 'overview'"
          @join-session="joinSession"
        />

        <ChatMessageFlow
          v-else
          :messages="currentMessages"
          @inspect-profile="(_: any ,info: any) => openUserActions(info)"
          @join-session="joinSession"
          @load-more="handleLoadMore"
          :isFetchingHistory="isFetchingHistory"
        />
      </div>

      <Transition name="badge">
        <div v-if="showNewMessageBadge" class="absolute bottom-24 left-0 w-full flex justify-center z-50 pointer-events-none">
          <button
            @click.stop="forceScrollToBottom"
            class="bg-secondary text-white rounded-full px-4 py-2 shadow-lg flex items-center justify-center gap-1.5 active:scale-95 transition-transform border border-white/20 pointer-events-auto"
          >
            <span class="text-[10px] font-black uppercase tracking-widest mt-0.5">New Message</span>
            <ion-icon :icon="svg(mdiChevronDown)" class="text-base" />
          </button>
        </div>
      </Transition>

      <ChatInputFooter
        v-if="activeTab !== 'overview'"
        @sent="onMessageSent"
        @open-invite-popover="openLobbyInvitePopover"
      />
    </div>
  </ion-modal>

  <LobbyInvitePopover
    :is-open="invitePopoverOpen"
    :event="inviteEvent"
    @close="invitePopoverOpen = false"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { IonModal, useIonRouter, IonIcon } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { mdiChevronDown } from "@mdi/js";
import { svg } from "@/helper/general.helper";

import ChatToasts from "./ChatToasts.vue";
import ChatTabsHeader from "./ChatTabsHeader.vue";
import ChatToolbar from "./ChatToolbar.vue";
import ChatOverview from "./ChatOverview.vue";
import ChatMessageFlow from "./ChatMessageFlow.vue";
import ChatInputFooter from "./ChatInputFooter.vue";
import LobbyInvitePopover from "./LobbyInvitePopover.vue";

import { useAuthStore } from "@/store/auth.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { socketJoinRoom } from "@/service/api/socket/drawSyncing.socket";
import { masterAnimation } from "@/helper/animation.helper";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { useScrollAnchor } from "@/composables/general/useScrollAnchor";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";

const authStore = useAuthStore();
const chatWidget = useChatWidgetStore();
const { isVisible, isExpanded, activeTab } = storeToRefs(chatWidget);
const { messagesByChat } = storeToRefs(useChatStore());
const { lobbyChatMessages } = storeToRefs(useDrawSyncer());
const { invitations } = storeToRefs(useDrawSyncer());

const messageContainer = ref<HTMLElement | null>(null);
const invitePopoverOpen = ref(false);
const inviteEvent = ref<Event | null>(null);
const { openUserActions } = useUserContextSheet();
const chatStore = useChatStore();
const router = useIonRouter();

const isFetchingHistory = ref(false);
const { scrollToBottom, captureScrollState, restoreScrollState } =
	useScrollAnchor(messageContainer);

const isAtBottom = ref(true);
const showNewMessageBadge = ref(false);

const onScroll = (e: Event) => {
	const el = e.target as HTMLElement;
	isAtBottom.value =
		Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 100;
	if (isAtBottom.value) showNewMessageBadge.value = false;
};

const forceScrollToBottom = () => {
	scrollToBottom(true);
	showNewMessageBadge.value = false;
};

const onMessageSent = async () => {
	await nextTick();
	forceScrollToBottom();
};

const currentMessages = computed(() => {
	return activeTab.value === "lobby"
		? lobbyChatMessages.value
		: messagesByChat.value[activeTab.value] || [];
});

watch(
	() => currentMessages.value.length,
	(newLen, oldLen) => {
		if (newLen > oldLen) {
			nextTick(() => {
				if (isAtBottom.value) {
					scrollToBottom(true);
				} else {
					const lastMsg = currentMessages.value[
						currentMessages.value.length - 1
					] as any;
					const isMe =
						lastMsg.sender_id === authStore.user?._id ||
						lastMsg.member?._id === authStore.user?._id;
					if (!isMe) showNewMessageBadge.value = true;
				}
			});
		}
	},
);

watch(
	[activeTab, isExpanded],
	async ([tab, expanded], [prevTab]) => {
		if (!expanded) return;
		if (tab == "lobby" || tab == "overview") return;
		const tabChanged = tab !== prevTab;

		if (tabChanged) {
			showNewMessageBadge.value = false;
			await chatStore.switchToConversation(tab);
			scrollToBottom(true);
		} else {
			chatStore.clearUnreads(tab);
		}
	},
	{ immediate: true },
);

const openLobbyInvitePopover = (ev: Event) => {
	inviteEvent.value = ev;
	invitePopoverOpen.value = true;
};

function joinSession(roomId: string) {
	invitations.value = invitations.value.filter((inv) => inv.roomId !== roomId);
	chatWidget.closePanel();
	router.push(FRONTEND_ROUTES.draw, masterAnimation);
	setTimeout(() => {
		socketJoinRoom({ roomId: roomId, intent: "join" });
	}, 200);
}

const handleLoadMore = async () => {
	if (isFetchingHistory.value) return;
	const el = messageContainer.value;
	if (!el || el.scrollTop > 200 || !currentMessages.value.length) return;
	if (chatStore.hasMoreMessagesByChat[activeTab.value] === false) return;

	isFetchingHistory.value = true;
	const snapshot = captureScrollState();

	try {
		await chatStore.loadMessages(activeTab.value, false);
		await nextTick();
		if (snapshot) restoreScrollState(snapshot);
	} finally {
		setTimeout(() => {
			isFetchingHistory.value = false;
		}, 200);
	}
};
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none !important; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.badge-enter-active, .badge-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.badge-enter-from, .badge-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
</style>