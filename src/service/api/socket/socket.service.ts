import { io, Socket } from "socket.io-client";
import {
	CommentRes,
	Res,
	SOCKET_ENDPONTS,
	SocketLoginParams,
} from "@/types/server.types";
import { useAuthStore } from "@/store/auth.store";
import { storeToRefs } from "pinia";
import { useToast } from "@/service/toast.service";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";
import { useInboxStore } from "@/store/inbox.store";
import { useBalloonStore } from "@/store/balloon.store";
import { registerChatHandlers } from "@/service/api/socket/chat.socket";
import { useModerationStore } from "@/store/moderation.store";
import { useInAppNotificationStore } from "@/store/inAppNotificationStore";

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
		query: { clientVersion: "3" },
	});

	// Register Sub-Socket Handlers
	// Draw-sync handlers pull in the heavy fabric/render engine, so we load them
	// lazily off the critical path — the engine chunk is fetched shortly after
	// connect instead of being part of the app-start bundle.
	const drawSocket = socket;
	void import("@/service/api/socket/drawRoomHandlers.socket").then((m) =>
		m.registerDrawSyncingHandlers(drawSocket),
	);
	registerChatHandlers(socket);
	useBalloonStore().setupSocketListeners();
	useInAppNotificationStore().registerSocketListener();

	// --- INTERNAL LIFECYCLE ---

	socket.io.on("reconnect", () => {
		if (!user.value?._id) return;
		socketLogin({ _id: user.value._id });
	});

	socket.on("disconnect", () => {
		const store = useAuthStore();
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

	socket.on(SOCKET_ENDPONTS.comment, (params: Res<CommentRes>) => {
		if (!params) return;
		const inboxStore = useInboxStore();
		if (inboxStore.hasItem(params.inbox_item_id)) {
			inboxStore.addComment(params);
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
