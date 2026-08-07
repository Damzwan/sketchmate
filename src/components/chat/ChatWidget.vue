<template>
  <!-- Keep the custom sheet inside Ionic's stacking context. Ionic appends
       modals to ion-app at z-index 20000+, so profile/photo overlays can layer
       naturally above this z-9999 sheet and reveal it unchanged on dismiss. -->
  <Teleport to="ion-app">
    <Transition name="fade" appear>
      <div
        v-show="isVisible && isExpanded"
        class="fixed inset-0 bg-black/40 z-[9998] touch-none"
        @click="chatWidget.closePanel()"
      ></div>
    </Transition>

    <Transition name="sheet" appear>
      <div
        v-show="isVisible && isExpanded"
        class="sheet-wrapper fixed inset-x-0 bottom-0 top-[env(safe-area-inset-top,0px)] z-[9999] flex flex-col overflow-hidden overscroll-none rounded-t-[2.5rem] shadow-2xl"
        :class="{
          'is-dragging': isDragging,
          'is-active': isExpanded,
        }"
        :style="{
          ...chatWidgetSurfaceStyle,
          paddingBottom: keyboardInset + 'px',
          ...(sheetOffset > 0 ? { transform: `translate3d(0, ${sheetOffset}px, 0)` } : {})
        }"
      >
        <div
          class="relative z-10 w-full flex justify-center pt-3 pb-3 shrink-0 touch-none cursor-grab active:cursor-grabbing chat-widget-chrome"
          @pointerdown="onDragStart"
          @pointermove.prevent="onDragMove"
          @pointerup="onDragEnd"
          @pointercancel="onDragEnd"
        >
          <div class="w-12 h-1.5 rounded-full pointer-events-none" :style="{ background: chatPalette.controlBorder }"></div>
        </div>

        <!-- Frequent closes keep the hot subtree alive briefly. Long-idle panels
             release avatars, images and message component effects. -->
        <div v-if="contentMounted" class="relative z-10 flex flex-col flex-1 min-h-0">
          <ChatTabsHeader />

          <ChatToolbar
            :widget-customization="chatCustomization"
            @inspect-profile="(_: any ,info: any) => openUserActions(info)"
            @open-report="openUserActions"
          />

          <div class="relative flex-1 min-h-0">
            <img
              v-if="chatBackgroundVisible"
              :src="chatCustomization.backgroundImageUrl"
              alt=""
              aria-hidden="true"
              decoding="async"
              class="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
              :style="{ opacity: chatCustomization.backgroundImageOpacity }"
            />

            <div
              ref="messageContainer"
              class="absolute inset-0 overflow-y-auto hide-scrollbar px-3 pt-3 pb-1"
              @scroll="onScroll"
              @touchmove.stop
            >
              <ChatOverview
                v-if="activeTab === 'overview'"
                :font-effect-class="chatFontEffectClass"
                @join-session="joinSession"
              />

              <ChatMessageFlow
                v-else
                :messages="currentMessages"
                @inspect-profile="onInspectProfile"
                @join-session="joinSession"
                @load-more="handleLoadMore"
                :isFetchingHistory="isFetchingHistory"
              />
            </div>
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
      </div>
    </Transition>
  </Teleport>

  <LobbyInvitePopover
    :is-open="invitePopoverOpen"
    :event="inviteEvent"
    @close="invitePopoverOpen = false"
  />

  <!-- Mounted as a SIBLING of the chat sheet, not inside it: it's opened from
       both the header strip and the composer banner, and nesting an ion-modal
       inside the sheet it overlays makes the two fight over the backdrop. -->
  <RelationshipInfoModal
    v-model:open="relationshipInfoOpen"
    :chat="activeConversation"
    :partner="activePartner"
    :current-user="authStore.user"
    :current-user-id="authStore.user?._id"
  />

  <ChatWidgetCustomizationModal
    v-if="customizationLoaded"
    v-model:open="customizationOpen"
  />

</template>

<script setup lang="ts">
import {
	computed,
	defineAsyncComponent,
	nextTick,
	onBeforeUnmount,
	ref,
	watch,
} from "vue";
import { useBackButton, useIonRouter, IonIcon } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { useThrottleFn } from "@vueuse/core";
import { mdiChevronDown } from "@mdi/js";
import { svg } from "@/helper/general.helper";

import ChatTabsHeader from "./ChatTabsHeader.vue";
import ChatToolbar from "./ChatToolbar.vue";
import ChatInputFooter from "./ChatInputFooter.vue";
import LobbyInvitePopover from "./LobbyInvitePopover.vue";
import RelationshipInfoModal from "./RelationshipInfoModal.vue";
import {
	hydrateChatCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveReadableCustomizationPalette,
	resolveTheme,
} from "@/config/profile_options.config";

import { useAuthStore } from "@/store/auth.store";
import { useParentalStore } from "@/store/parental.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useFriendStore } from "@/store/friend.store";
import { useMenuStore } from "@/store/menu.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { socketJoinRoom } from "@/service/api/socket/drawSyncing.socket";
import { masterAnimation } from "@/helper/animation.helper";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { useScrollAnchor } from "@/composables/general/useScrollAnchor";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { useKeyboardInset } from "@/composables/general/useKeyboardInset";
import { useEscapeKey } from "@/composables/general/useEscapeKey";

// These are the two largest pane subtrees and neither is needed until the chat
// sheet opens. Keeping them in separate chunks removes message rendering and
// overview customization work from the app's initial bundle path.
const ChatOverview = defineAsyncComponent(() => import("./ChatOverview.vue"));
const ChatMessageFlow = defineAsyncComponent(
	() => import("./ChatMessageFlow.vue"),
);
const ChatWidgetCustomizationModal = defineAsyncComponent(
	() => import("./ChatWidgetCustomizationModal.vue"),
);

const authStore = useAuthStore();
const chatWidget = useChatWidgetStore();
const {
	isVisible,
	isExpanded,
	activeTab,
	relationshipInfoOpen,
	customizationOpen,
} = storeToRefs(chatWidget);
const { messagesByChat } = storeToRefs(useChatStore());
const { lobbyChatMessages } = storeToRefs(useDrawSyncer());
const { invitations } = storeToRefs(useDrawSyncer());
const { viewProfileMenuOpen } = storeToRefs(useMenuStore());

const messageContainer = ref<HTMLElement | null>(null);
const invitePopoverOpen = ref(false);
const inviteEvent = ref<Event | null>(null);
const { openUserActions } = useUserContextSheet();
const chatStore = useChatStore();
const friendStore = useFriendStore();
const subscriptionStore = useSubscriptionStore();
const router = useIonRouter();

const chatCustomization = computed(() =>
	hydrateChatCustomization((authStore.user as any)?.chat_customization),
);
const chatTheme = computed(() => resolveTheme(chatCustomization.value.themeId));
const chatPalette = computed(() =>
	resolveReadableCustomizationPalette(chatTheme.value),
);
const chatFontFamily = computed(() =>
	resolveFontFamily(chatCustomization.value.fontId),
);
const chatFontEffectClass = computed(() =>
	resolveFontEffectClass(chatCustomization.value.fontEffectId),
);
const chatWidgetSurfaceStyle = computed(() => ({
	background: chatTheme.value.cardBg,
	borderColor: chatTheme.value.cardBorderColor,
	fontFamily: chatFontFamily.value,
	"--chat-widget-name": chatPalette.value.name,
	"--chat-widget-desc": chatPalette.value.desc,
	"--chat-widget-utility": chatPalette.value.utility,
	"--chat-widget-scrim": chatPalette.value.scrim,
	"--chat-widget-border": chatPalette.value.controlBorder,
	"--chat-widget-control-bg": chatPalette.value.controlBg,
	"--chat-widget-accent": chatTheme.value.accentColor,
}));
const chatBackgroundVisible = computed(
	() =>
		subscriptionStore.isPro &&
		activeTab.value !== "overview" &&
		!!chatCustomization.value.backgroundImageUrl,
);

const isFetchingHistory = ref(false);
const { scrollToBottom, captureScrollState, restoreScrollState } =
	useScrollAnchor(messageContainer);

const isAtBottom = ref(true);
const showNewMessageBadge = ref(false);
const contentMounted = ref(isExpanded.value);
// `defineAsyncComponent` alone still starts loading when Vue first renders the
// component. Gate the render as well so chat customization stays off the chat
// opening path until the palette is actually requested.
const customizationLoaded = ref(customizationOpen.value);
watch(customizationOpen, (open) => {
	if (open) customizationLoaded.value = true;
});
const lowEnd =
	typeof document !== "undefined" &&
	document.documentElement.classList.contains("low-end");
const CLOSED_CONTENT_TTL_MS = lowEnd ? 3_000 : 20_000;
let contentReleaseTimer: ReturnType<typeof setTimeout> | null = null;

const sheetOffset = ref(0);
const isDragging = ref(false);
let dragStartY = 0;
let dragStartTime = 0;

const clearContentReleaseTimer = () => {
	if (!contentReleaseTimer) return;
	clearTimeout(contentReleaseTimer);
	contentReleaseTimer = null;
};

watch(
	isExpanded,
	(expanded) => {
		clearContentReleaseTimer();
		if (expanded) {
			contentMounted.value = true;
			sheetOffset.value = 0;
			onWillPresent();
			return;
		}
		contentReleaseTimer = setTimeout(() => {
			contentMounted.value = false;
			contentReleaseTimer = null;
		}, CLOSED_CONTENT_TTL_MS);
	},
	{ immediate: true },
);

const onDragStart = (event: PointerEvent) => {
	dragStartY = event.clientY;
	dragStartTime = performance.now();
	isDragging.value = true;
	(event.currentTarget as HTMLElement)?.setPointerCapture(event.pointerId);
};

const onDragMove = (event: PointerEvent) => {
	if (!isDragging.value) return;
	sheetOffset.value = Math.max(0, event.clientY - dragStartY);
};

const onDragEnd = (event: PointerEvent) => {
	if (!isDragging.value) return;
	isDragging.value = false;
	const handle = event.currentTarget as HTMLElement | null;
	if (handle?.hasPointerCapture(event.pointerId))
		handle.releasePointerCapture(event.pointerId);

	const distance = sheetOffset.value;
	const velocity = distance / Math.max(1, performance.now() - dragStartTime);
	if (distance > 150 || velocity > 0.5) {
		chatWidget.closePanel();
		setTimeout(() => {
			sheetOffset.value = 0;
		}, 250);
	} else {
		sheetOffset.value = 0;
	}
};

const hasPresentedIonicOverlay = () =>
	!!document.querySelector(
		[
			"ion-modal:not(.overlay-hidden)",
			"ion-alert:not(.overlay-hidden)",
			"ion-action-sheet:not(.overlay-hidden)",
			"ion-popover:not(.overlay-hidden)",
		].join(","),
	);

// Ionic overlays and menus reserve priorities 100 and 99 respectively. Keep
// this custom sheet immediately below both so the top Ionic layer gets Back
// first. The explicit guards also cover non-dismissible overlays (which do not
// register Ionic's Back handler) and the short gap while an overlay presents.
useBackButton(98, (processNextHandler) => {
	if (!isVisible.value || !isExpanded.value) {
		processNextHandler();
		return;
	}

	if (
		viewProfileMenuOpen.value ||
		relationshipInfoOpen.value ||
		customizationOpen.value ||
		invitePopoverOpen.value ||
		hasPresentedIonicOverlay()
	) {
		return;
	}

	chatWidget.closePanel();
});

// Ionic modals handle Escape themselves. The chat sheet is now a lightweight
// custom overlay, so give it the same desktop/browser behavior without closing
// it underneath a profile or relationship overlay.
useEscapeKey(() => chatWidget.closePanel(), {
	enabled: () =>
		isVisible.value &&
		isExpanded.value &&
		!viewProfileMenuOpen.value &&
		!relationshipInfoOpen.value &&
		!invitePopoverOpen.value &&
		!hasPresentedIonicOverlay(),
});

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

// Resolved here rather than passed down, because the info sheet is mounted
// outside the chat panel and can't reach the footer's own `currentChat`.
const activeConversation = computed(() => {
	if (activeTab.value === "overview" || activeTab.value === "lobby")
		return null;
	return (
		[...chatStore.activeChats, ...friendStore.pendingRequests].find(
			(c) => c._id === activeTab.value,
		) ?? null
	);
});

const activePartner = computed(
	() =>
		activeConversation.value?.participants?.find(
			(p: any) => p._id !== authStore.user?._id,
		) ?? null,
);

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
	// Families policy: the online-safety reminder for child accounts now lives
	// in the parental store, which shows it once per 30 days across every
	// exchange surface (chat, mate adding, drawing sends, shared rooms) rather
	// than only here. Opening a conversation is the earliest moment for chat.
	if (chatWidget.activeTab !== "overview") {
		void useParentalStore().ensureCanExchange("mate_chat");
	}
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

onBeforeUnmount(() => {
	clearContentReleaseTimer();
});
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none !important; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.sheet-wrapper {
  transform: translate3d(0, 0, 0);
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
  max-width: 520px;
  margin: auto;;
}
.sheet-wrapper.is-active,
.sheet-wrapper.is-dragging {
  will-change: transform;
}
.sheet-wrapper.is-dragging {
  transition: none;
}
.chat-widget-chrome {
  background: var(--chat-widget-scrim, var(--ion-color-background));
  border-color: var(--chat-widget-border, rgba(0,0,0,0.08));
}
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translate3d(0, 100%, 0) !important;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.badge-enter-active, .badge-leave-active {
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.badge-enter-from, .badge-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.95);
}
</style>
