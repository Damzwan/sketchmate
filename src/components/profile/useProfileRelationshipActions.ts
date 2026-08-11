import {
	mdiAccountCancelOutline,
	mdiAlertCircleOutline,
	mdiChatOutline,
	mdiTimerSandComplete,
} from "@mdi/js";
import { type ComputedRef, computed } from "vue";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { useConfirm } from "@/composables/useConfirm";
import { useDrawSyncer } from "@/draw/sync/session.store";
import {
	blockUser,
	unblockUser,
	unfriendUser,
} from "@/service/api/relationship.api";
import { useToast } from "@/service/toast.service";
import { useChatStore } from "@/store/chat.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useFriendStore } from "@/store/friend.store";
import { useModerationStore } from "@/store/moderation.store";

interface RelationshipActionState {
	target: ComputedRef<any>;
	status: ComputedRef<string | undefined>;
	isBlocked: ComputedRef<boolean>;
	isMe: ComputedRef<boolean>;
	hasRequiredVersion: ComputedRef<boolean>;
}

export function useProfileRelationshipActions(state: RelationshipActionState) {
	const friends = useFriendStore();
	const chats = useChatStore();
	const chatWidget = useChatWidgetStore();
	const moderation = useModerationStore();
	const { closeSheet } = useUserContextSheet();
	const { confirm } = useConfirm();
	const { toast } = useToast();

	function onStartChat() {
		if (!state.target.value?._id || !state.hasRequiredVersion.value) return;
		chatWidget.openChatWithUser(state.target.value._id);
		closeSheet();
	}

	const primaryCta = computedCta(state, onStartChat);

	async function onToggleFollow() {
		const profile = state.target.value;
		if (!profile || state.isMe.value) return;
		try {
			const following = await friends.toggleFollowUser(profile);
			if (profile.relationship) profile.relationship.isFollowing = following;
			toast(
				following ? `Following ${profile.name}` : `Unfollowed ${profile.name}`,
			);
		} catch {
			toast("Action failed", { color: "danger" });
		}
	}

	async function onUnfriend() {
		const partner = state.target.value;
		if (!partner) return;
		const permanent = state.status.value === "mate";
		const approved = await confirm({
			header: permanent ? "Unfriend?" : "End Trial?",
			message: permanent
				? `Remove ${partner.name}? Chat invites locked for 48h.`
				: `Stop chatting with ${partner.name}?`,
			cancelText: "Keep",
			confirmText: permanent ? "Remove" : "End",
			destructive: true,
		});
		if (!approved) return;
		try {
			await unfriendUser(partner._id);
			friends.removeFriendLocally(partner._id);
			void friends.refreshMyStats();
			chats.expireChat(partner._id);
			toast(permanent ? `Removed ${partner.name}` : "Trial ended");
			closeSheet();
		} catch {
			toast("Action failed", { color: "danger" });
		}
	}

	async function confirmToggleBlock() {
		const target = state.target.value;
		if (!target) return;
		if (state.isBlocked.value) {
			try {
				await unblockUser(target._id);
				friends.unblockUserLocally(target._id);
				chats.resetChatWithUser(target._id);
				toast(`${target.name} unblocked`);
			} catch {
				toast("Action failed", { color: "danger" });
			}
			return;
		}

		const approved = await confirm({
			header: "Block User?",
			message: `Are you sure you want to block ${target.name}? They will no longer be able to message you or see your sketches.`,
			confirmText: "Block",
			destructive: true,
		});
		if (!approved) return;
		try {
			await blockUser(target._id);
			friends.blockUserLocally(target._id);
			void friends.refreshMyStats();
			if (useDrawSyncer().isLobby) {
				const { useDrawObjectManager } = await import(
					"@/draw/canvas/drawObjectManager"
				);
				useDrawObjectManager().purgeBlockedObjects();
			}
			toast(`${target.name} blocked`);
			closeSheet();
		} catch {
			toast("Action failed", { color: "danger" });
		}
	}

	function report() {
		const profile = state.target.value;
		if (profile?._id) {
			moderation.openReport({
				type: "user",
				id: profile._id,
				label: profile.name,
			});
		}
	}

	return {
		primaryCta,
		onStartChat,
		onToggleFollow,
		onUnfriend,
		confirmToggleBlock,
		report,
	};
}

function computedCta(state: RelationshipActionState, onStartChat: () => void) {
	return computed(() => {
		if (state.isBlocked.value)
			return {
				label: "User Blocked",
				icon: mdiAccountCancelOutline,
				disabled: true,
				handler: () => {},
			};
		if (!state.hasRequiredVersion.value)
			return {
				label: "User needs to update to chat",
				icon: mdiAlertCircleOutline,
				disabled: true,
				handler: () => {},
			};
		return {
			label: ["temporary", "pending_mate"].includes(state.status.value ?? "")
				? "Continue Chat"
				: "Message",
			icon: ["temporary", "pending_mate"].includes(state.status.value ?? "")
				? mdiTimerSandComplete
				: mdiChatOutline,
			disabled: false,
			handler: onStartChat,
		};
	});
}
