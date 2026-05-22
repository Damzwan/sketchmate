import { io, Socket } from "socket.io-client";
import {
	CommentParams,
	CommentRes,
	InboxItem,
	Res,
	SendParams,
	SOCKET_ENDPONTS,
	SocketLoginParams,
} from "@/types/server.types";
import { useAuthStore } from "@/store/auth.store";
import { storeToRefs } from "pinia";
import { useToast } from "@/service/toast.service";
import { dismissButton } from "@/config/toast.config";
import { ToastDuration } from "@/types/toast.types";
import { showFeedbackMilestones } from "@/config/general.config";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";
import { useInboxStore } from "@/store/inbox.store";
import { useSessionStore } from "@/store/session.store";
import { useBalloonStore } from "@/store/balloon.store";
import { useDrawStore } from "@/draw/store/draw.store";
import { registerDrawSyncingHandlers } from "@/service/api/socket/drawSyncing.socket";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { registerChatHandlers } from "@/service/api/socket/chat.socket";
import { useModerationStore } from "@/store/moderation.store";
import { getPartialUsers } from "@/service/api/user.api";

export let socket: Socket | undefined;

let resolveSocketLoggedIn: () => void;
export let socketLoggedInPromise = new Promise<void>((resolve) => {
	resolveSocketLoggedIn = resolve;
});

/**
 * Initializes and connects the global socket instance
 */
export async function socketConnect(): Promise<void> {
	if (socket) return;

	const { user } = storeToRefs(useAuthStore());

	socket = io(import.meta.env.VITE_BACKEND as string, {
		transports: ["websocket"],
		withCredentials: true,
		reconnection: true,
		reconnectionAttempts: Infinity,
		query: { clientVersion: "2" },
	});

	// Register Sub-Socket Handlers
	registerDrawSyncingHandlers(socket);
	registerChatHandlers(socket);

	const { setupSocketListeners } = useBalloonStore();
	setupSocketListeners();

	// --- INTERNAL LIFECYCLE ---

	socket.io.on("reconnect", () => {
		if (!user.value?._id) return;
		socketLogin({ _id: user.value._id });
	});

	socket.on("disconnect", () => {
		const store = useAuthStore();
		store.refreshNeeded = true;
	});

	socket.on(SOCKET_ENDPONTS.login, () => {
		resolveSocketLoggedIn?.();
	});

	socket.on(SOCKET_ENDPONTS.moderation_strike, (payload: any) => {
		useModerationStore().handleStrike(payload);
	});

	socket.on(SOCKET_ENDPONTS.moderation_restriction_lifted, () => {
		useModerationStore().handleRestrictionLifted();
		const { toast } = useToast();
		toast("Your restriction has been lifted. Welcome back!", {
			color: "success",
		});
	});

	socket.on(
		"capability-blocked",
		(payload: { action: any; restriction: any }) => {
			const modStore = useModerationStore();
			const menuStore = useMenuStore();

			modStore.notifyCapabilityBlocked({
				capability: payload.action,
				restriction: payload.restriction,
			});

			menuStore.openMenu(Menu.ModerationMenu);
		},
	);

	// --- GLOBAL DRAWING EVENTS ---

	// socket.on(SOCKET_ENDPONTS.send, async (params: Res<InboxItem>) => {
	// 	if (!params) return;
	//
	// 	const { user } = storeToRefs(useAuthStore());
	// 	const { inbox, inboxUsers } = storeToRefs(useInboxStore());
	// 	const { updateSlide } = storeToRefs(useSessionStore());
	// 	const { toast } = useToast();
	//
	// 	updateSlide.value = true;
	//
	// 	if (inbox.value.length > 0) {
	// 		inbox.value = [params, ...inbox.value];
	// 	}
	//
	// 	// Sync missing user data for followers
	// 	const missingFollowers = params.original_followers.filter(
	// 		(id) => !inboxUsers.value.some((u) => u._id === id),
	// 	);
	//
	// 	if (missingFollowers.length > 0) {
	// 		getPartialUsers(missingFollowers).then((res) => {
	// 			if (res) inboxUsers.value = [...inboxUsers.value, ...res];
	// 		});
	// 	}
	//
	// 	// Check Milestones
	// 	if (params.sender === user.value?._id) {
	// 		const { isSendingDrawing } = storeToRefs(useDrawStore());
	// 		isSendingDrawing.value = false;
	//
	// 		const sentCount = inbox.value.filter(
	// 			(item) => item.sender === user.value?._id,
	// 		).length;
	// 		if (showFeedbackMilestones.includes(sentCount)) {
	// 			const { openMenu } = useMenuStore();
	// 			openMenu(Menu.FeedbackMenu);
	// 		}
	// 	}
	//
	// 	const isSender = params.sender === user.value?._id;
	//
	// 	toast(isSender ? "Drawing sent!" : "New drawing received", {
	// 		buttons: [
	// 			dismissButton,
	// 			{
	// 				text: "View",
	// 				handler: () => {
	// 					const { openSwiper } = usePhotoSwiper();
	// 					openSwiper([params], 0, {
	// 						canReply: !isSender,
	// 						canDelete: () => true,
	// 					});
	// 				},
	// 			},
	// 		],
	// 		duration: ToastDuration.long,
	// 	});
	// });

	socket.on(SOCKET_ENDPONTS.comment, (params: Res<CommentRes>) => {
		if (params) {
			const { addComment } = useInboxStore();
			addComment(params);
		}
	});
}

/**
 * Cleanup socket instance
 */
export async function socketDisconnect(): Promise<void> {
	if (socket) {
		socket.disconnect();
		socket = undefined;
	}
}

/**
 * Identifies the socket session with the server
 */
export async function socketLogin(params: SocketLoginParams): Promise<void> {
	if (!socket) return;
	socket.emit(SOCKET_ENDPONTS.login, { ...params, version: __APP_VERSION__ });
}
