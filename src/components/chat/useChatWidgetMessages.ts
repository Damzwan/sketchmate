import { useIonRouter } from "@ionic/vue";
import { useThrottleFn } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, nextTick, type Ref, ref, watch } from "vue";
import { useScrollAnchor } from "@/composables/general/useScrollAnchor";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { masterAnimation } from "@/helper/animation.helper";
import { socketJoinRoom } from "@/service/api/socket/drawSyncing.socket";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useFriendStore } from "@/store/friend.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

export function useChatWidgetMessages(
	activeTab: Ref<string>,
	isExpanded: Ref<boolean>,
) {
	const auth = useAuthStore();
	const chatStore = useChatStore();
	const friendStore = useFriendStore();
	const chatWidget = useChatWidgetStore();
	const drawSync = useDrawSyncer();
	const router = useIonRouter();
	const { messagesByChat } = storeToRefs(chatStore);
	const { lobbyChatMessages, invitations } = storeToRefs(drawSync);
	const { openUserActions } = useUserContextSheet();
	const messageContainer = ref<HTMLElement | null>(null);
	const isFetchingHistory = ref(false);
	const isAtBottom = ref(true);
	const showNewMessageBadge = ref(false);
	const { scrollToBottom, captureScrollState, restoreScrollState } =
		useScrollAnchor(messageContainer);

	const activeConversation = computed(() => {
		if (["overview", "lobby"].includes(activeTab.value)) return null;
		return (
			[...chatStore.activeChats, ...friendStore.pendingRequests].find(
				(conversation) => conversation._id === activeTab.value,
			) ?? null
		);
	});
	const activePartner = computed(
		() =>
			activeConversation.value?.participants?.find(
				(participant: any) => participant._id !== auth.user?._id,
			) ?? null,
	);
	const currentMessages = computed(() =>
		activeTab.value === "lobby"
			? lobbyChatMessages.value
			: messagesByChat.value[activeTab.value] || [],
	);

	const onScroll = useThrottleFn(
		(event: Event) => {
			const element = event.target as HTMLElement;
			isAtBottom.value =
				Math.abs(
					element.scrollHeight - element.scrollTop - element.clientHeight,
				) < 100;
			if (isAtBottom.value) showNewMessageBadge.value = false;
		},
		100,
		true,
	);

	function forceScrollToBottom() {
		scrollToBottom(true);
		showNewMessageBadge.value = false;
	}
	async function onMessageSent() {
		await nextTick();
		forceScrollToBottom();
	}

	watch(
		() => currentMessages.value.length,
		(length, previousLength) => {
			if (length <= previousLength) return;
			void nextTick(() => {
				if (isAtBottom.value) {
					chatStore.trimOldMessages(activeTab.value);
					scrollToBottom(true);
					return;
				}
				const message = currentMessages.value.at(-1) as any;
				const sentByMe =
					message?.sender_id === auth.user?._id ||
					message?.member?._id === auth.user?._id;
				if (!sentByMe) showNewMessageBadge.value = true;
			});
		},
	);

	watch(
		[activeTab, isExpanded],
		async ([tab, expanded], [previousTab]) => {
			if (!expanded || tab === "lobby" || tab === "overview") return;
			if (tab !== previousTab) {
				showNewMessageBadge.value = false;
				await chatStore.switchToConversation(tab);
				scrollToBottom(true);
			} else {
				chatStore.clearUnreads(tab);
			}
		},
		{ immediate: true },
	);

	async function handleLoadMore() {
		const element = messageContainer.value;
		if (
			isFetchingHistory.value ||
			!element ||
			element.scrollTop > 200 ||
			!currentMessages.value.length ||
			chatStore.hasMoreMessagesByChat[activeTab.value] === false
		)
			return;
		isFetchingHistory.value = true;
		const snapshot = captureScrollState();
		try {
			await chatStore.loadMessages(activeTab.value, false);
			await nextTick();
			if (snapshot) restoreScrollState(snapshot);
		} finally {
			setTimeout(() => (isFetchingHistory.value = false), 200);
		}
	}

	function joinSession(roomId: string) {
		invitations.value = invitations.value.filter(
			(invitation) => invitation.roomId !== roomId,
		);
		chatWidget.closePanel();
		void router.push(FRONTEND_ROUTES.draw, masterAnimation);
		setTimeout(() => socketJoinRoom({ roomId, intent: "join" }), 200);
	}

	return {
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
		onInspectProfile: (_event: Event, info: any) => openUserActions(info),
	};
}
