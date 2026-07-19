<template>
  <ChatToasts />

  <ion-modal
    :is-open="isVisible && isExpanded"
    @will-present="onWillPresent"
    @did-dismiss="chatWidget.closePanel()"
    :keepContentsMounted="true"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    class="liquid-chat-modal"
  >
    <!-- overscroll-none stops a flick inside the thread from chaining into the
         page behind the sheet, which is what made the panel feel like it could
         still be scrolled once the keyboard had pushed it up. -->
    <div
      class="flex flex-col h-full bg-background relative overflow-hidden overscroll-none"
      :style="{ paddingBottom: keyboardInset + 'px' }"
    >

      <ChatTabsHeader />

      <ChatToolbar
        @inspect-profile="(_: any ,info: any) => openUserActions(info)"
        @open-report="openUserActions"
      />

      <div
        @scroll="onScroll"
        @touchmove.stop
        class="flex-1 min-h-0 overflow-y-auto relative hide-scrollbar px-3 py-3"
        ref="messageContainer"
      >
        <ChatOverview
          v-if="isExpanded && activeTab === 'overview'"
          @join-session="joinSession"
        />

        <ChatMessageFlow
          v-else-if="isExpanded"
          :messages="currentMessages"
          @inspect-profile="onInspectProfile"
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
import { alertController, IonModal, useIonRouter, IonIcon } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { useThrottleFn } from "@vueuse/core";
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
import { useKeyboardInset } from "@/composables/general/useKeyboardInset";

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

// scrollHeight/scrollTop/clientHeight are all layout-forcing reads. Unthrottled
// that's a synchronous reflow on every scroll frame, over a DOM the size of the
// whole thread. 100ms is far below the "am I at the bottom" decision's real
// resolution, so nothing observable is lost.
const onScroll = useThrottleFn(
	(e: Event) => {
		const el = e.target as HTMLElement;
		isAtBottom.value =
			Math.abs(el.scrollHeight - el.scrollTop - el.clientHeight) < 100;
		if (isAtBottom.value) showNewMessageBadge.value = false;
	},
	100,
	true,
);

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
					// The only moment trimming is invisible: pinned to the bottom
					// means the dropped rows sit far above the viewport, so no
					// scroll anchor shifts. Trim before scrolling so the scroll
					// lands on the final height, not one about to change.
					chatStore.trimOldMessages(activeTab.value);
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

// Stable identity so ChatMessageFlow (and every bubble under it) isn't handed a
// new prop on each render of this component — see the note in ChatMessageFlow.
const onInspectProfile = (_ev: Event, info: any) => openUserActions(info);

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

function onWillPresent() {
	const { isLobby } = useDrawSyncer();
	const tab = chatWidget.activeTab;
	// Land on the screen that makes sense for where the user actually is:
	//  - stale lobby tab (already left the room) → back to the overview
	//  - sitting on the overview while inside a lobby → jump straight into the
	//    lobby chat (opening chat from a lobby shouldn't dump you in the list)
	//  - an open DM is left exactly where it was
	if (tab === "lobby" && !isLobby) {
		chatWidget.activeTab = "overview";
	} else if (tab === "overview" && isLobby) {
		chatWidget.activeTab = "lobby";
	}
	scrollToBottom(true);
	maybeShowSafetyReminder();
}

// ── Families policy: online-safety reminder ────────────────────────────────
// Under-age accounts get a clear, prominent safety notice BEFORE they can
// exchange messages/media — once per device, re-shown after 30 days.
const SAFETY_ACK_KEY = "sm_chat_safety_ack";
const SAFETY_ACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function maybeShowSafetyReminder() {
	if (!authStore.isUnderAge) return;
	try {
		const last = Number(localStorage.getItem(SAFETY_ACK_KEY) || 0);
		if (Date.now() - last < SAFETY_ACK_TTL_MS) return;
	} catch {
		/* storage unavailable → show the reminder */
	}
	const alert = await alertController.create({
		header: "Stay safe online",
		cssClass: "liquid-alert",
		backdropDismiss: false,
		message:
			"Chatting online has real-world risks. Only chat with people you know in person, " +
			"never share personal information (like your full name, address, school or photos of yourself), " +
			"and tell a trusted adult if anything feels wrong. You can report or block anyone from their profile.",
		buttons: [
			{
				text: "I understand",
				role: "confirm",
				handler: () => {
					try {
						localStorage.setItem(SAFETY_ACK_KEY, String(Date.now()));
					} catch {
						/* fine — it'll show again next open */
					}
				},
			},
		],
	});
	await alert.present();
}

// Measured from the visual viewport rather than from Capacitor's reported
// keyboard height, so the same code aligns the footer on native and in a
// browser. See useKeyboardInset for why the plugin number wasn't enough.
const { keyboardInset } = useKeyboardInset({
	onWillShow: () => forceScrollToBottom(),
});

// Re-pin to the bottom once the viewport has actually settled as well. The
// `willShow` hint fires before the resize, so on its own it scrolls to a
// bottom that is about to move.
watch(keyboardInset, () => nextTick(() => forceScrollToBottom()));
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