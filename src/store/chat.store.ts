import { defineStore } from "pinia";
import { computed, ref } from "vue";
import dayjs from "dayjs";
import {
	BaseMessage,
	Mate,
	PopulatedConversation,
	ChatStatus,
} from "@/types/server.types";
import {
	getActiveChats,
	getChatMessages,
	markAsRead,
} from "@/service/api/chat.api";
import {
	emitSendMessage,
	emitTypingStatus,
} from "@/service/api/socket/chat.socket";
import { socket } from "@/service/api/socket/socket.service";
import { useAuthStore } from "@/store/auth.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useFriendStore } from "@/store/friend.store";
import { v4 as uuidv4 } from "uuid";
import {
	cancelMateRequest,
	respondToRelationship,
} from "@/service/api/relationship.api";
import { useUserCacheStore } from "@/store/userCache.store";
import { useQuotaStore } from "@/store/quota.store";

type FrontendMessage = BaseMessage & {
	isOptimistic?: boolean;
	localKey?: string;
	status?: "sending" | "sent" | "error";
};

export const useChatStore = defineStore("chat", () => {
	// --- STATE ---
	const activeChats = ref<PopulatedConversation[]>([]);
	const messagesByChat = ref<Record<string, FrontendMessage[]>>({});
	const typingStatuses = ref<Record<string, boolean>>({});
	const hasMoreMessagesByChat = ref<Record<string, boolean>>({});
	const notifications = ref<any[]>([]);

	const authStore = useAuthStore();
	const friendStore = useFriendStore();
	const chatWidget = useChatWidgetStore();

	// --- GETTERS ---

	const totalUnreadCount = computed(() => {
		if (!authStore.user) return 0;
		const userId = authStore.user._id;
		const activeSum = activeChats.value.reduce(
			(total, chat) => total + (chat.unread_counts?.[userId] || 0),
			0,
		);
		const pendingSum = friendStore.pendingRequests.reduce(
			(total, chat) => total + (chat.unread_counts?.[userId] || 0),
			0,
		);
		return activeSum + pendingSum;
	});

	const canSendMessage = computed(() => (tabId: string) => {
		if (tabId === "lobby") return true;
		const me = authStore.user?._id;
		if (!me) return false;
		const friendStore = useFriendStore();
		const chat =
			activeChats.value.find((c) => c._id === tabId) ||
			friendStore.pendingRequests.find((c) => c._id === tabId);
		if (!chat) return true;

		if (chat.status === "expired") return false;
		if (chat.status === "pending_invite") return false; // blocks both sides
		if (chat.status === "temporary" && chat.trial_expires_at) {
			if (dayjs().isAfter(dayjs(chat.trial_expires_at))) return false;
		}
		return true;
	});

	const chatInputPlaceholder = computed(() => (tabId: string) => {
		if (tabId === "lobby") return "Sketch a message...";
		const me = authStore.user?._id;
		const chat =
			activeChats.value.find((c) => c._id === tabId) ||
			friendStore.pendingRequests.find((c) => c._id === tabId);

		if (chat) {
			// FIX: Using standardized ChatStatus
			if (chat.status === "pending_invite")
				return chat.initiator_id === me
					? "Waiting for response..."
					: "Accept request to reply...";
			if (chat.status === "expired")
				return "Chat locked. Re-match to continue.";
			if (chat.status === "temporary" && chat.trial_expires_at) {
				if (dayjs().isAfter(dayjs(chat.trial_expires_at)))
					return "Trial ended. Send Mate request!";
				const hoursLeft = dayjs(chat.trial_expires_at).diff(dayjs(), "hour");
				return hoursLeft > 0
					? `Message... (${hoursLeft}h trial left)`
					: "Message... (Trial ending soon)";
			}
		}
		return "Write a message...";
	});

	const isMate = computed(() => (tabId: string) => {
		const chat = activeChats.value.find((c) => c._id === tabId);
		// FIX: Using 'mate' instead of 'active'
		return chat?.status === "mate";
	});

	const mateRequestStatus = computed(() => (tabId: string) => {
		const me = authStore.user?._id;
		const chat = activeChats.value.find((c) => c._id === tabId);
		// FIX: Using 'pending_mate' instead of 'mate_pending'
		if (chat?.status !== "pending_mate") return null;
		return chat.initiator_id === me ? "sent" : "received";
	});

	// --- CORE ACTIONS ---

	async function loadActiveChats() {
		const userCache = useUserCacheStore();
		try {
			const chats = await getActiveChats();
			activeChats.value = chats as PopulatedConversation[];
			for (const chat of chats) {
				userCache.upsertMany(chat.participants as any);
			}
		} catch (e) {
			console.error("Failed to load active chats:", e);
		}
	}

	function addIncomingMessage(
		conversation_id: string,
		message: BaseMessage,
		fullConversation?: PopulatedConversation,
	) {
		const userCache = useUserCacheStore();
		const me = authStore.user?._id;

		// 1. Append message to the chat
		if (!messagesByChat.value[conversation_id])
			messagesByChat.value[conversation_id] = [];
		if (
			!messagesByChat.value[conversation_id].some((m) => m._id === message._id)
		) {
			messagesByChat.value[conversation_id].push(message as FrontendMessage);
		}

		// 2. Determine if the incoming socket payload actually contains populated profiles
		const isPopulated =
			fullConversation?.participants?.length &&
			typeof fullConversation.participants[0] === "object" &&
			"_id" in fullConversation.participants[0];

		if (isPopulated) {
			userCache.upsertMany(fullConversation.participants as any);
		}

		const activeIdx = activeChats.value.findIndex(
			(c) => c._id === conversation_id,
		);
		const pendingIdx = friendStore.pendingRequests.findIndex(
			(c) => c._id === conversation_id,
		);

		// 3. SMART MERGE: Find out who sent this, even if the backend gave us raw string IDs
		let partnerIdStr = "";
		if (fullConversation?.participants) {
			const p = fullConversation.participants.find(
				(p: any) =>
					(typeof p === "object" ? p._id || p.toString() : p.toString()) !== me,
			);
			// @ts-ignore
			partnerIdStr = typeof p === "object" ? p._id : p?.toString();
		}

		const legacyConvo =
			activeChats.value.find(
				(c) =>
					c._id !== conversation_id &&
					c.participants?.some((p: any) => p._id === partnerIdStr), // <-- ADDED ?.
			) ||
			friendStore.pendingRequests.find(
				(c) =>
					c._id !== conversation_id &&
					c.participants?.some((p: any) => p._id === partnerIdStr), // <-- ADDED ?.
			);

		const updateChatMetadata = (chat: PopulatedConversation) => {
			chat.last_message = message;
			chat.updatedAt = message.createdAt;

			if (fullConversation) {
				chat.status = fullConversation.status;
				chat.trial_expires_at = fullConversation.trial_expires_at;
				chat.unread_counts = fullConversation.unread_counts;
				chat.initiator_id = fullConversation.initiator_id;
				chat.relationship_id = fullConversation.relationship_id;

				if (isPopulated) {
					chat.participants = fullConversation.participants;
				} else if (legacyConvo?.participants) {
					// Steal the fully loaded profiles from the old chat so the UI doesn't crash!
					chat.participants = legacyConvo.participants;
				}
			}
			return chat;
		};

		let processedChat: PopulatedConversation | null = null;

		if (activeIdx > -1) {
			processedChat = updateChatMetadata({ ...activeChats.value[activeIdx] });
			activeChats.value.splice(activeIdx, 1);
		} else if (pendingIdx > -1) {
			processedChat = updateChatMetadata({
				...friendStore.pendingRequests[pendingIdx],
			});
			friendStore.pendingRequests.splice(pendingIdx, 1);
		} else if (fullConversation) {
			// Brand new chat from socket
			processedChat = { ...fullConversation };

			if (!isPopulated) {
				if (legacyConvo?.participants) {
					processedChat.participants = legacyConvo.participants;
				} else {
					// Absolute last resort fallback
					processedChat.participants = processedChat.participants.map(
						(id: any) => {
							const idStr =
								typeof id === "object"
									? id._id || id.toString()
									: id.toString();
							const cached = userCache.getUser(idStr);
							return cached || { _id: idStr, name: "Artist", img: "" };
						},
					) as any;
				}
			}
		}

		if (processedChat) {
			// 5. DEDUPLICATION: Purge the old dead conversation from the UI
			if (partnerIdStr) {
				const filterFn = (c: PopulatedConversation) =>
					c._id !== legacyConvo?._id;
				activeChats.value = activeChats.value.filter(filterFn);
				friendStore.pendingRequests =
					friendStore.pendingRequests.filter(filterFn);
			}

			// Auto-read logic
			if (
				me &&
				chatWidget.isExpanded &&
				chatWidget.activeTab === conversation_id
			) {
				if (!processedChat.unread_counts) processedChat.unread_counts = {};
				processedChat.unread_counts[me] = 0;
				markAsRead(conversation_id).catch(console.error);
			}

			// 6. PROPER ROUTING: Push to pending if they need to accept it
			if (
				processedChat.status === "pending_invite" &&
				processedChat.initiator_id !== me
			) {
				friendStore.pendingRequests.unshift(processedChat);
			} else {
				activeChats.value.unshift(processedChat);
			}

			// 7. PREVENT UI FREEZE: If User B was looking at the old chat, seamlessly shift their view to the new one
			if (legacyConvo && chatWidget.activeTab === legacyConvo._id) {
				chatWidget.activeTab = conversation_id;
				chatWidget.removeChatHead(legacyConvo._id);
				chatWidget.addChatHead(conversation_id, "chat");

				// Move old messages to the new chat tab so history doesn't flicker
				if (messagesByChat.value[legacyConvo._id]) {
					messagesByChat.value[conversation_id] = [
						...messagesByChat.value[legacyConvo._id],
						...(messagesByChat.value[conversation_id] || []),
					];
					delete messagesByChat.value[legacyConvo._id];
				}
			}
		}
	}

	// --- MESSAGING & OPTIMISTIC ENGINE ---

	async function sendMessage(
		receiver_id: string,
		content: string,
		currentTabId: string,
		shared_post_id?: string,
		shared_inbox_item_id?: string,
		options: { silent?: boolean } = {},
	) {
		if (!socket) throw new Error("Socket not connected");
		const tempId = uuidv4();

		const optimisticMessage = {
			_id: tempId,
			localKey: tempId,
			content,
			shared_post_id: shared_post_id || null,
			shared_inbox_item_id: shared_inbox_item_id || null,
			sender_id: authStore.user?._id,
			createdAt: new Date().toISOString(),
			status: "sending",
			isOptimistic: true,
		};

		addOptimisticMessage(currentTabId, optimisticMessage);

		try {
			const response = await emitSendMessage(
				socket,
				receiver_id,
				content,
				shared_post_id,
				shared_inbox_item_id,
			);

			if (response.success && response.message && response.conversation) {
				const realChatId = response.conversation._id;

				// Migrate optimistic messages from temp tab → real conversation id
				if (currentTabId !== realChatId) {
					const tempMsgs = messagesByChat.value[currentTabId] || [];
					messagesByChat.value[realChatId] = [
						...(messagesByChat.value[realChatId] || []),
						...tempMsgs,
					];
					delete messagesByChat.value[currentTabId];

					if (!activeChats.value.some((c) => c._id === realChatId)) {
						activeChats.value.unshift(
							response.conversation as PopulatedConversation,
						);
					}
				}

				const existingIdx = activeChats.value.findIndex(
					(c) => c._id === realChatId,
				);
				if (existingIdx !== -1) {
					activeChats.value[existingIdx] = {
						...activeChats.value[existingIdx],
						status: response.conversation.status,
						trial_expires_at: response.conversation.trial_expires_at,
						initiator_id: response.conversation.initiator_id,
						relationship_id: response.conversation.relationship_id,
						updatedAt: response.conversation.updatedAt,
					};
				}

				resolveOptimisticMessage(
					realChatId,
					tempId,
					{
						...response.message,
						localKey: tempId,
						status: "sent",
						isOptimistic: true,
					},
					realChatId,
				);

				if (!options.silent && chatWidget.activeTab === currentTabId) {
					chatWidget.addChatHead(realChatId, "chat");
					chatWidget.activeTab = realChatId;
					if (currentTabId !== realChatId)
						chatWidget.removeChatHead(currentTabId);
				}

				return response;
			}
		} catch (error) {
			const msgs = messagesByChat.value[currentTabId];
			if (msgs) {
				const m = msgs.find((msg) => msg._id === tempId);
				if (m) m.status = "error";
			}
			throw error;
		}
	}

	function addOptimisticMessage(chatId: string, message: any) {
		if (!messagesByChat.value[chatId]) messagesByChat.value[chatId] = [];
		messagesByChat.value[chatId].push(message);
	}

	function resolveOptimisticMessage(
		chatId: string,
		tempId: string,
		resolvedMessage: any,
		actualConversationId?: string,
	) {
		const targetId = actualConversationId || chatId;
		if (!messagesByChat.value[targetId]) messagesByChat.value[targetId] = [];
		const chatMessages = messagesByChat.value[chatId];
		if (!chatMessages) return;
		const index = chatMessages.findIndex((msg) => msg._id === tempId);
		if (index !== -1) {
			resolvedMessage.localKey = chatMessages[index].localKey || tempId;
			const targetArray = messagesByChat.value[targetId];
			const duplicateIndex = targetArray.findIndex(
				(m) => m._id === resolvedMessage._id && m._id !== tempId,
			);
			if (duplicateIndex !== -1) {
				chatMessages.splice(index, 1);
				targetArray[duplicateIndex].status = "sent";
				targetArray[duplicateIndex].localKey = resolvedMessage.localKey;
			} else {
				if (actualConversationId && actualConversationId !== chatId) {
					chatMessages.splice(index, 1);
					if (!messagesByChat.value[targetId])
						messagesByChat.value[targetId] = [];
					messagesByChat.value[targetId].push(resolvedMessage);
				} else chatMessages.splice(index, 1, resolvedMessage);
			}
		}
	}

	// --- TYPING STATUS ---

	function setTypingStatus(sender_id: string, is_typing: boolean) {
		typingStatuses.value[sender_id] = is_typing;
		if (is_typing) {
			setTimeout(() => {
				if (typingStatuses.value[sender_id])
					typingStatuses.value[sender_id] = false;
			}, 3000);
		}
	}

	function sendTypingIndicator(receiver_id: string, is_typing: boolean) {
		if (socket) emitTypingStatus(socket, receiver_id, is_typing);
	}

	// --- HISTORY & READ STATUS ---

	async function loadMessages(conversationId: string, isInitial = true) {
		const existing = messagesByChat.value[conversationId] || [];
		if (isInitial && existing.length > 0) return existing.length;
		try {
			const before =
				!isInitial && existing.length ? existing[0].createdAt : undefined;
			const response = (await getChatMessages(conversationId, before)) as any;
			hasMoreMessagesByChat.value[conversationId] = response.hasMore;
			messagesByChat.value[conversationId] = isInitial
				? response.data
				: [...response.data, ...existing];
			return response.data.length;
		} catch (e) {
			console.error("History sync failed:", e);
			return 0;
		}
	}

	async function clearUnreads(conversationId: string) {
		const chat = activeChats.value.find((c) => c._id === conversationId);
		if (!chat || !authStore.user) return;
		if (!chat.unread_counts) chat.unread_counts = {};
		if (chat.unread_counts[authStore.user._id] === 0) return;
		chat.unread_counts[authStore.user._id] = 0;
		try {
			await markAsRead(conversationId);
		} catch (e) {
			console.error("Failed to mark as read:", e);
		}
	}

	async function switchToConversation(conversationId: string) {
		if (["lobby", "overview"].includes(conversationId)) return;
		if (!messagesByChat.value[conversationId]?.length)
			await loadMessages(conversationId, true);
		clearUnreads(conversationId);
	}

	// --- NOTIFICATIONS ---

	function addNotification(notif: any) {
		if (chatWidget.isExpanded && chatWidget.activeTab === notif.tabId) return;
		const existing = notifications.value.find((n) => n.tabId === notif.tabId);
		if (existing) {
			existing.lines.push({ id: Date.now(), text: notif.text });
			if (existing.lines.length > 2) existing.lines.shift();
			clearTimeout(existing.timer);
			existing.timer = setTimeout(() => removeNotification(notif.tabId), 8000);
		} else {
			notifications.value.push({
				...notif,
				lines: [{ id: Date.now(), text: notif.text }],
				timer: setTimeout(() => removeNotification(notif.tabId), 8000),
			});
		}
	}

	function removeNotification(tabId: string) {
		notifications.value = notifications.value.filter((n) => n.tabId !== tabId);
	}

	function clearLobbyNotifications() {
		notifications.value = notifications.value.filter((n) => {
			if (n.tabId?.startsWith("lobby")) {
				clearTimeout(n.timer);
				return false;
			}
			return true;
		});
	}

	// --- SOCKET HANDLERS (RELATIONSHIP LIFECYCLE) ---

	function handleRequestAccepted(payload: {
		conversation: PopulatedConversation;
	}) {
		const idx = activeChats.value.findIndex(
			(c) => c._id === payload.conversation._id,
		);
		if (idx !== -1) {
			activeChats.value[idx] = {
				...activeChats.value[idx],
				...payload.conversation,
			};
		} else {
			activeChats.value.unshift(payload.conversation);
		}

		const partner = payload.conversation.participants.find(
			(p) => p._id !== authStore.user?._id,
		);
		addNotification({
			tabId: payload.conversation._id,
			subtitle: partner?.name || "Sketchmate",
			text: "Accepted your request! You have 24h to vibe.",
			img: partner?.img || "",
			isTrial: true,
		});
	}

	function handleRequestDeclined(payload: { conversation_id: string }) {
		const widgetStore = useChatWidgetStore();
		const chat = activeChats.value.find(
			(c) => c._id === payload.conversation_id,
		);
		const partner = chat?.participants.find(
			(p) => p._id !== authStore.user?._id,
		);

		activeChats.value = activeChats.value.filter(
			(c) => c._id !== payload.conversation_id,
		);

		if (widgetStore.activeTab === payload.conversation_id) {
			widgetStore.activeTab = "overview";
			widgetStore.removeChatHead(payload.conversation_id);
		}

		addNotification({
			tabId: "overview",
			subtitle: partner?.name || "Artist",
			text: "Not ready to connect yet. Keep sketching!",
			img: partner?.img || "",
			isRequest: false,
		});
	}

	function handleMateMatched(payload: { conversation: PopulatedConversation }) {
		const index = activeChats.value.findIndex(
			(c) => c._id === payload.conversation._id,
		);
		if (index !== -1)
			activeChats.value[index] = {
				...activeChats.value[index],
				...payload.conversation,
				status: "mate", // FIX: 'active' -> 'mate'
			};
		const partner = payload.conversation.participants.find(
			(p) => p._id !== authStore.user?._id,
		) as Mate;
		if (partner) friendStore.addFriendLocally(partner as any);
		addNotification({
			tabId: payload.conversation._id,
			subtitle: "New Mate!",
			text: `You and ${partner?.name} are now Mates!`,
			img: partner?.img || "",
			isMateProposal: true,
		});

		useQuotaStore().refresh(true);
	}

	function handleMateDeclined(payload: {
		conversation_id: string;
		conversation: PopulatedConversation;
		status: ChatStatus; // Typed strictly now
	}) {
		const index = activeChats.value.findIndex(
			(c) => c._id === payload.conversation_id,
		);
		if (index !== -1) {
			activeChats.value[index] = {
				...activeChats.value[index],
				...payload.conversation,
				status: payload.status,
				initiator_id: undefined,
			};
		}
		const partner = payload.conversation.participants.find(
			(p) => p._id !== authStore.user?._id,
		);
		const isExpired = payload.status === "expired";
		addNotification({
			tabId: payload.conversation_id,
			subtitle: "Proposal Update",
			text: isExpired
				? `${partner?.name} isn't ready to re-match yet.`
				: `${partner?.name} wants to stay in the trial phase.`,
			img: partner?.img || "",
			isTrial: !isExpired,
			isRequest: false,
		});
	}

	function handleMateUnfriended(payload: {
		conversation_id: string;
		conversation: PopulatedConversation;
	}) {
		const partner = payload.conversation.participants.find(
			(p) => p._id !== authStore.user?._id,
		);
		const index = activeChats.value.findIndex(
			(c) => c._id === payload.conversation_id,
		);
		if (index !== -1) {
			activeChats.value[index] = {
				...activeChats.value[index],
				...payload.conversation,
				status: "expired",
			};
		} else {
			activeChats.value.unshift(payload.conversation);
		}
		if (partner) friendStore.removeFriendLocally(partner._id);
		addNotification({
			tabId: payload.conversation_id,
			subtitle: "Connection Ended",
			text: `Matership with ${partner?.name || "Artist"} has ended.`,
			img: partner?.img || "",
			isTrial: false,
		});
		useQuotaStore().refresh(true);
	}

	function handleMateRequested(payload: {
		conversation_id: string;
		conversation: PopulatedConversation;
		wasExpired: boolean;
	}) {
		const index = activeChats.value.findIndex(
			(c) => c._id === payload.conversation_id,
		);
		if (index !== -1)
			activeChats.value[index] = {
				...activeChats.value[index],
				...payload.conversation,
				status: "pending_mate",
			};
		else activeChats.value.unshift(payload.conversation);
		const partner = payload.conversation.participants.find(
			(p) => p._id !== authStore.user?._id,
		);
		addNotification({
			tabId: payload.conversation_id,
			subtitle: partner?.name || "New Request",
			text: payload.wasExpired
				? "Wants to re-match as Mates! 🎨"
				: "Wants to be Mates! 💖",
			img: partner?.img || "",
			isMateProposal: true,
		});
		useChatWidgetStore().triggerNewMessageAlert(payload.conversation_id);
	}

	async function respondToRequest(
		conversationId: string,
		action: "accept" | "decline",
	) {
		const chat =
			friendStore.pendingRequests.find((c) => c._id === conversationId) ||
			activeChats.value.find((c) => c._id === conversationId);

		if (!chat?.relationship_id) {
			console.error("Missing relationship_id", conversationId);
			return;
		}

		try {
			const response = (await respondToRelationship(
				chat.relationship_id,
				action,
			)) as any;
			const widgetStore = useChatWidgetStore();

			if (action === "accept") {
				const conversation = response.conversation as PopulatedConversation;
				friendStore.pendingRequests = friendStore.pendingRequests.filter(
					(c) => c._id !== conversationId,
				);
				activeChats.value = activeChats.value.filter(
					(c) => c._id !== conversationId,
				);
				activeChats.value.unshift(conversation);
				widgetStore.addChatHead(conversation._id, "chat");
				widgetStore.activeTab = conversation._id;
			} else {
				friendStore.pendingRequests = friendStore.pendingRequests.filter(
					(c) => c._id !== conversationId,
				);
				activeChats.value = activeChats.value.filter(
					(c) => c._id !== conversationId,
				);
				widgetStore.removeChatHead(conversationId);
				if (widgetStore.activeTab === conversationId)
					widgetStore.activeTab = "overview";
			}
		} catch (e) {
			console.error("Failed to respond to request:", e);
		}
	}

	function resetChatWithUser(userId: string) {
		const idx = activeChats.value.findIndex((c) =>
			c.participants.some((p) => p._id === userId),
		);
		if (idx > -1) {
			activeChats.value[idx] = {
				...activeChats.value[idx],
				status: "none",
			};
		}
	}

	async function handleCancelMateRequest(conversationId: string) {
		try {
			const response = (await cancelMateRequest(conversationId)) as any;
			const idx = activeChats.value.findIndex((c) => c._id === conversationId);

			if (idx !== -1) {
				activeChats.value[idx] = {
					...activeChats.value[idx],
					status: response.status,
					initiator_id: undefined,
				};
			}
		} catch (e) {
			console.error("Failed to cancel mate request", e);
		}
	}

	return {
		activeChats,
		messagesByChat,
		typingStatuses,
		notifications,
		hasMoreMessagesByChat,
		totalUnreadCount,
		canSendMessage,
		chatInputPlaceholder,
		isMate,
		mateRequestStatus,
		loadActiveChats,
		addIncomingMessage,
		sendMessage,
		loadMessages,
		clearUnreads,
		switchToConversation,
		addNotification,
		removeNotification,
		clearLobbyNotifications,
		handleRequestAccepted,
		handleRequestDeclined,
		handleMateMatched,
		handleMateDeclined,
		handleMateUnfriended,
		handleMateRequested,
		setTypingStatus,
		sendTypingIndicator,
		respondToRequest,
		resetChatWithUser,
		handleCancelMateRequest,
	};
});
