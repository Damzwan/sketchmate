import { useChatStore } from "@/store/chat.store";
import { useAuthStore } from "@/store/auth.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import {
	acceptMatership,
	declineMatership,
	requestMatership,
} from "@/service/api/relationship.api";
import { PopulatedConversation } from "@/types/server.types";
import { useToast } from "@/service/toast.service";

/**
 * Every mutation on the Invite → Trial → Mates journey, in one place.
 *
 * These used to live as emits on ChatRelationshipBanner that ChatInputFooter
 * implemented. That was fine while the banner was the only surface, but the
 * same actions are now reachable from the header strip and the info modal too,
 * and three components emitting six events each into one parent is how the
 * optimistic local patches drift apart. A composable keeps the API calls and
 * their local-state updates married.
 *
 * Pass a getter for the chat rather than the chat itself: callers hold a
 * computed that re-resolves as the conversation object is replaced by socket
 * updates, and a snapshot taken at setup would go stale on the first patch.
 */
export function useRelationshipActions(getChat: () => any) {
	const chatStore = useChatStore();
	const authStore = useAuthStore();

	/** Replace the local conversation in place so the UI reacts immediately. */
	function patchLocal(patch: Record<string, any>) {
		const chat = getChat();
		if (!chat?._id) return;
		const idx = chatStore.activeChats.findIndex((c) => c._id === chat._id);
		if (idx !== -1) {
			chatStore.activeChats[idx] = { ...chatStore.activeChats[idx], ...patch };
		}
	}

	/** Accept / ignore an incoming sketch invite (pending_invite). */
	function respondToInvite(action: "accept" | "decline") {
		const chat = getChat();
		if (!chat?._id) return;
		return chatStore.respondToRequest(chat._id, action);
	}

	/** Ask to become permanent Mates (from a trial, or after it expired). */
	async function requestMate() {
		const chat = getChat();
		if (!chat?.relationship_id) return;
		try {
			await requestMatership(chat._id);
			patchLocal({
				status: "pending_mate",
				initiator_id: authStore.user?._id?.toString(),
			});
		} catch (e: any) {
			// The server enforces the anti-pestering ladder and answers 429. The UI
			// hides the button when it knows about a cooldown, but it can be stale
			// (the decline may have landed a moment ago), so surface the server's
			// own wording rather than a generic failure — and patch the local state
			// so the button disappears instead of inviting another attempt.
			const body = e?.response?.data ?? e?.data;
			if (
				body?.error === "mate_request_cooldown" ||
				body?.error === "mate_request_locked"
			) {
				patchLocal({
					mate_request_locked: body.error === "mate_request_locked",
					mate_request_cooldown_until: body.cooldown_until ?? null,
				});
				useToast().toast(
					body.message || "You can't send another request right now",
					{ color: "warning" },
				);
				return;
			}
			console.error("Mate request failed", e);
		}
	}

	async function acceptMate() {
		const chat = getChat();
		if (!chat?.relationship_id) return;
		try {
			const { conversation } = (await acceptMatership(
				chat.relationship_id,
			)) as { conversation: PopulatedConversation };
			chatStore.handleMateMatched({ conversation });
		} catch (e) {
			console.error("Mate accept failed", e);
		}
	}

	async function declineMate() {
		const chat = getChat();
		if (!chat?.relationship_id) return;
		try {
			const { status } = (await declineMatership(chat.relationship_id)) as any;
			patchLocal({ status, initiator_id: undefined });
		} catch (e) {
			console.error("Mate decline failed", e);
		}
	}

	function cancelMate() {
		const chat = getChat();
		if (!chat?._id) return;
		return chatStore.handleCancelMateRequest(chat._id);
	}

	function openPaywall() {
		useSubscriptionStore().openPaywall();
	}

	return {
		respondToInvite,
		requestMate,
		acceptMate,
		declineMate,
		cancelMate,
		openPaywall,
	};
}
