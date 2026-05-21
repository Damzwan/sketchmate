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
    <div class="flex flex-col h-full bg-primary/30 backdrop-blur-3xl relative">

      <ChatTabsHeader />

      <ChatToolbar
        @inspect-profile="(_ ,info) => openUserActions(info)"
        @open-report="openUserActions"
      />

      <div
        @touchmove.stop
        class="flex-1 overflow-y-auto relative hide-scrollbar px-3 py-2"
        ref="messageContainer"
      >

        <ChatOverview
          v-if="activeTab === 'overview'"
          @join-session="joinSession"
        />

        <ChatMessageFlow
          v-else
          :messages="currentMessages"
          @inspect-profile="(_ ,info) => openUserActions(info)"
          @join-session="joinSession"
          @load-more="handleLoadMore"
          :isFetchingHistory="isFetchingHistory"
        />
      </div>

      <ChatInputFooter
        v-if="activeTab !== 'overview'"
        @sent="scrollToBottom"
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
import { IonModal, useIonRouter } from "@ionic/vue";
import { storeToRefs } from "pinia";

// Components
import ChatToasts from "./ChatToasts.vue";
import ChatTabsHeader from "./ChatTabsHeader.vue";
import ChatToolbar from "./ChatToolbar.vue";
import ChatOverview from "./ChatOverview.vue";
import ChatMessageFlow from "./ChatMessageFlow.vue";
import ChatInputFooter from "./ChatInputFooter.vue";
import LobbyInvitePopover from "./LobbyInvitePopover.vue";

// Stores
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { socketJoinRoom } from "@/service/api/socket/drawSyncing.socket";
import { masterAnimation } from "@/helper/animation.helper";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { useScrollAnchor } from "@/composables/general/useScrollAnchor";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";

const chatWidget = useChatWidgetStore();
const { isVisible, isExpanded, activeTab } = storeToRefs(chatWidget);
const { messagesByChat } = storeToRefs(useChatStore());
const { lobbyChatMessages } = storeToRefs(useDrawSyncer());

const { invitations } = storeToRefs(useDrawSyncer());

// --- Local UI State ---
const messageContainer = ref<HTMLElement | null>(null);
const invitePopoverOpen = ref(false);
const inviteEvent = ref<Event | null>(null);
const { openUserActions } = useUserContextSheet();
const chatStore = useChatStore();

const router = useIonRouter();

const isFetchingHistory = ref(false);
const { scrollToBottom, captureScrollState, restoreScrollState } =
	useScrollAnchor(messageContainer);

// --- Computed ---
const currentMessages = computed(() => {
	return activeTab.value === "lobby"
		? lobbyChatMessages.value
		: messagesByChat.value[activeTab.value] || [];
});

watch(
	[activeTab, isExpanded],
	async ([tab, expanded], [prevTab]) => {
		if (!expanded) return;
		if (tab == "lobby" || tab == "overview") return;

		const tabChanged = tab !== prevTab;

		if (tabChanged) {
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
	if (!el || el.scrollTop > 200) return;

	if (!currentMessages.value.length) return;
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
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

ion-modal.liquid-chat-modal {
  --height: 85vh;
  --border-radius: 2.5rem 2.5rem 0 0;
}
</style>