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

    <Transition name="sheet" appear @after-leave="onSheetAfterLeave">
      <div
        ref="sheetEl"
        v-show="isVisible && isExpanded"
        class="sheet-wrapper fixed inset-x-0 bottom-0 top-[env(safe-area-inset-top,0px)] z-[9999] flex flex-col overflow-hidden overscroll-none rounded-t-[2.5rem] shadow-2xl"
        :class="{
          'is-dragging': isDragging,
          'is-active': isExpanded,
          'is-closing': isClosing,
        }"
        :style="{
          ...chatWidgetSurfaceStyle,
          paddingBottom: displayedKeyboardInset + 'px',
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
              width="1"
              height="1"
              loading="lazy"
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
import { IonIcon, useBackButton } from "@ionic/vue";
import { mdiChevronDown } from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, defineAsyncComponent, nextTick, ref, watch } from "vue";
import { useEscapeKey } from "@/composables/general/useEscapeKey";
import { useKeyboardInset } from "@/composables/general/useKeyboardInset";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useMenuStore } from "@/store/menu.store";
import { useParentalStore } from "@/store/parental.store";
import ChatInputFooter from "./ChatInputFooter.vue";
import ChatTabsHeader from "./ChatTabsHeader.vue";
import ChatToolbar from "./ChatToolbar.vue";
import LobbyInvitePopover from "./LobbyInvitePopover.vue";
import RelationshipInfoModal from "./RelationshipInfoModal.vue";
import { useChatWidgetAppearance } from "./useChatWidgetAppearance";
import { useChatWidgetMessages } from "./useChatWidgetMessages";
import { useChatWidgetSheet } from "./useChatWidgetSheet";

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
const { viewProfileMenuOpen } = storeToRefs(useMenuStore());

const sheetEl = ref<HTMLElement | null>(null);
const invitePopoverOpen = ref(false);
const inviteEvent = ref<Event | null>(null);
const { openUserActions } = useUserContextSheet();
const {
	messageContainer,
	isFetchingHistory,
	showNewMessageBadge,
	activeConversation,
	activePartner,
	currentMessages,
	onScroll,
	forceScrollToBottom,
	onMessageSent,
	handleLoadMore,
	joinSession,
	onInspectProfile,
} = useChatWidgetMessages(activeTab, isExpanded);
const {
	chatCustomization,
	chatPalette,
	chatFontEffectClass,
	chatWidgetSurfaceStyle,
	chatBackgroundVisible,
} = useChatWidgetAppearance(activeTab);
const {
	contentMounted,
	customizationLoaded,
	sheetOffset,
	isDragging,
	onDragStart,
	onDragMove,
	onDragEnd,
} = useChatWidgetSheet(isExpanded, customizationOpen, onWillPresent);

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

const openLobbyInvitePopover = (ev: Event) => {
	inviteEvent.value = ev;
	invitePopoverOpen.value = true;
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
	forceScrollToBottom();
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

// Closing while the composer is focused makes the keyboard inset collapse at
// the same time as the sheet translates down. That changes the sheet's internal
// height mid-transition and reads as a flicker/jump, especially on Android.
// Freeze the last inset for the short leave animation, and keep the layer on the
// compositor until it is fully off-screen.
const isClosing = ref(false);
const closingKeyboardInset = ref(0);
const displayedKeyboardInset = computed(() =>
	isClosing.value ? closingKeyboardInset.value : keyboardInset.value,
);

watch(isExpanded, (expanded) => {
	if (expanded) {
		isClosing.value = false;
		closingKeyboardInset.value = 0;
		return;
	}

	closingKeyboardInset.value = keyboardInset.value;
	isClosing.value = true;
	const activeElement = document.activeElement;
	if (
		activeElement instanceof HTMLElement &&
		sheetEl.value?.contains(activeElement)
	) {
		activeElement.blur();
	}
});

function onSheetAfterLeave() {
	if (isExpanded.value) return;
	isClosing.value = false;
	closingKeyboardInset.value = 0;
	sheetOffset.value = 0;
	isDragging.value = false;
}

// Re-pin to the bottom once the viewport has actually settled as well. The
// `willShow` hint fires before the resize, so on its own it scrolls to a
// bottom that is about to move.
watch(keyboardInset, () => nextTick(() => forceScrollToBottom()));
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none !important; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.sheet-wrapper {
  transform: translate3d(0, 0, 0);
  transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
  max-width: 520px;
  margin: auto;
  backface-visibility: hidden;
}
.sheet-wrapper.is-active,
.sheet-wrapper.is-closing,
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
