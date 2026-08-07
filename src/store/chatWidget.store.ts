import { defineStore } from "pinia";
import { ref } from "vue";
import { useChatStore } from "./chat.store";

export type ChatHead = { id: string; type: "chat" | "user" };

export const useChatWidgetStore = defineStore("chatWidget", () => {
	const isVisible = ref(true);
	const isExpanded = ref(false);
	const activeTab = ref<"overview" | "lobby" | string>("overview");
	const activeChatHeads = ref<ChatHead[]>([]);

	const bouncingBubbles = ref<string[]>([]);
	const showLobbyPreview = ref(false);

	// The "How connections work" sheet. Opened from the header strip and from
	// any decision banner, so it's held here rather than in either of them.
	//
	// Replaces the old `minimizedBanners` list, which existed purely so a trial
	// nudge the user had already dismissed wouldn't re-inflate on every reopen.
	// Nothing needs dismissing now: ambient states are a one-line header strip
	// and only genuine decisions get a card.
	const relationshipInfoOpen = ref(false);
	const openRelationshipInfo = () => (relationshipInfoOpen.value = true);
	const customizationOpen = ref(false);
	const openCustomization = () => (customizationOpen.value = true);

	const showWidget = () => (isVisible.value = true);
	const hideWidget = () => {
		isVisible.value = false;
		isExpanded.value = false;
	};

	const openPanel = () => (isExpanded.value = true);
	const closePanel = () => (isExpanded.value = false);
	const togglePanel = () => (isExpanded.value = !isExpanded.value);

	const openOverview = () => {
		activeTab.value = "overview";
		openPanel();
	};
	const openLobby = () => {
		activeTab.value = "lobby";
		openPanel();
	};

	/**
	 * Heads accumulate for the whole session — every push notification, every
	 * profile tap adds one and nothing ever removed them but an explicit close.
	 * Each head keeps a conversation alive in the chat store's cache, so the list
	 * is what pins that memory. Cap it MRU-style: the newest are at the front, so
	 * the tail is the least recently opened.
	 */
	const MAX_CHAT_HEADS = 8;

	const trimChatHeads = () => {
		if (activeChatHeads.value.length <= MAX_CHAT_HEADS) return;
		const active = activeTab.value;
		const kept: ChatHead[] = [];
		for (const head of activeChatHeads.value) {
			// The open conversation is never evicted, however stale it has become.
			if (kept.length < MAX_CHAT_HEADS || head.id === active) kept.push(head);
		}
		activeChatHeads.value = kept;
	};

	const addChatHead = (id: string, type: "chat" | "user") => {
		if (!activeChatHeads.value.some((h) => h.id === id)) {
			activeChatHeads.value.unshift({ id, type });
			trimChatHeads();
		}
	};

	const openPrivateChat = (chatId: string) => {
		addChatHead(chatId, "chat");
		activeTab.value = chatId;
		openPanel();
		// Opening a chat *is* reading it. Don't leave this to ChatWidget's
		// activeTab watcher: entering from a push notification can run before that
		// component is mounted, and before the tab was ever a different one — so
		// the watcher may never fire and the message stays visibly unread until
		// the user bounces out to the overview and back.
		void useChatStore().clearUnreads(chatId);
	};

	/**
	 * NEW: The master routing action.
	 * Components call this with a User ID, and the store figures out the rest.
	 */
	const openChatWithUser = (userId: string) => {
		const chatStore = useChatStore();

		// Check if we already have an active conversation object
		const existingChat = chatStore.activeChats.find((c) =>
			c.participants.some((p) => p._id === userId),
		);

		if (existingChat) {
			openPrivateChat(existingChat._id);
		} else {
			// Create a temporary user chat head
			addChatHead(userId, "user");
			activeTab.value = userId;
			openPanel();
		}
	};

	const removeChatHead = (id: string) => {
		activeChatHeads.value = activeChatHeads.value.filter((h) => h.id !== id);
		if (activeTab.value === id) activeTab.value = "overview";
	};

	// Retained so a logout (or a rapid burst of alerts) can't leave a timer
	// pending that re-touches store state after everything has been reset.
	const bounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

	const triggerNewMessageAlert = (chatId: string) => {
		addChatHead(chatId, "chat");
		if (!bouncingBubbles.value.includes(chatId)) {
			bouncingBubbles.value.push(chatId);
			bounceTimers.set(
				chatId,
				setTimeout(() => {
					bounceTimers.delete(chatId);
					bouncingBubbles.value = bouncingBubbles.value.filter(
						(b) => b !== chatId,
					);
				}, 3000),
			);
		}
	};

	function resetRuntimeState() {
		for (const timer of bounceTimers.values()) clearTimeout(timer);
		bounceTimers.clear();

		activeChatHeads.value = [];
		bouncingBubbles.value = [];
		activeTab.value = "overview";
		isExpanded.value = false;
		isVisible.value = true;
		showLobbyPreview.value = false;
		relationshipInfoOpen.value = false;
		customizationOpen.value = false;
	}

	return {
		isVisible,
		isExpanded,
		activeTab,
		activeChatHeads,
		bouncingBubbles,
		showLobbyPreview,
		relationshipInfoOpen,
		openRelationshipInfo,
		customizationOpen,
		openCustomization,
		showWidget,
		hideWidget,
		openPanel,
		closePanel,
		togglePanel,
		openOverview,
		openLobby,
		openPrivateChat,
		openChatWithUser,
		addChatHead,
		removeChatHead,
		triggerNewMessageAlert,
		resetRuntimeState,
	};
});
