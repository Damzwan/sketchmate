import { Socket } from "socket.io-client";
import { storeToRefs } from "pinia";
import {
	LobbyChatItem,
	useDrawSyncer,
} from "@/draw/sync/session.store";
import { useDrawSyncEngine } from "@/draw/sync/drawSyncEngine";
import { useToast } from "@/service/toast.service";
import { useDrawStore } from "@/draw/session/draw.store";
import { SOCKET_ENDPONTS } from "@/types/server.types";
import { ToastDuration } from "@/types/toast.types";
import { useAuthStore } from "@/store/auth.store";
import { exportBoundingBoxImage } from "@/draw/document/export";
import { fitToDensestRegion } from "@/draw/canvas/viewport";
import { useFriendStore } from "@/store/friend.store";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { useModerationStore } from "@/store/moderation.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import {
	addRoomIdToUrl,
	removeRoomIdFromUrl,
	leaveRoom,
	socketJoinRoom,
} from "@/service/api/socket/drawSyncing.socket";

/**
 * Heavy canvas-sync socket handlers. Loaded lazily by socket.service so that
 * the Fabric render engine stays out of the app-start bundle and is only
 * fetched once a real-time drawing session is established.
 */
export function registerDrawSyncingHandlers(socket: Socket) {
	const { isBlocked } = useFriendStore();

	socket.on(
		"room-joined",
		async ({ roomId, users, isCreator, sessionId, isPublic, claimedAreas }) => {
			const {
				roomId: rm,
				roomMembers,
				isCreator: cr,
				isTryingToJoin,
				currentSessionId,
				isPublicLobby,
			} = storeToRefs(useDrawSyncer());
			rm.value = roomId;
			roomMembers.value = users;
			cr.value = isCreator;
			isTryingToJoin.value = false;
			currentSessionId.value = sessionId;
			addRoomIdToUrl(roomId);
			isPublicLobby.value = isPublic;
			useClaimArea().setAreas(claimedAreas);
		},
	);

	// ── Claimed-area sync ──────────────────────────────────────────────────
	socket.on("area-claimed", ({ area }) => {
		useClaimArea().upsertArea(area);
	});

	socket.on("area-released", ({ areaId }) => {
		useClaimArea().removeAreaById(areaId);
	});

	socket.on("areas-state", (areas) => {
		useClaimArea().setAreas(areas);
	});

	socket.on("user-joined", ({ user, timestamp, id }) => {
		const drawSyncer = useDrawSyncer();
		const { roomMembers } = storeToRefs(drawSyncer);

		if (!roomMembers.value.find((i) => i._id === user._id)) {
			roomMembers.value = [...roomMembers.value, user];
		}

		drawSyncer.pushLobbyItems([
			{
				type: "join",
				member: user,
				timestamp,
				_id: id,
			},
		]);
	});

	socket.on("user-left", async ({ user, id, timestamp }) => {
		const drawSyncer = useDrawSyncer();
		const { roomMembers, invitedFriends } = storeToRefs(drawSyncer);
		roomMembers.value = roomMembers.value.filter(
			(member) => member._id !== user._id,
		);
		invitedFriends.value = invitedFriends.value.filter((m) => m !== user._id);

		drawSyncer.pushLobbyItems([
			{
				type: "leave",
				member: user,
				timestamp,
				_id: id,
			},
		]);
	});

	socket.on("join-error", async ({ reason, message, restriction, action }) => {
		const { toast } = useToast();

		// 1. Handle predefined technical codes
		if (reason === "ROOM_FULL") {
			toast(`Room is full, try again later`, { color: "danger" });
		} else if (reason === "ROOM_NOT_FOUND") {
			removeRoomIdFromUrl();
			toast(`Room does not exist`, { color: "danger" });
		} else if (reason === "DOUBLE_JOIN") {
			toast("Joined from another device", { color: "danger" });
		} else if (reason === "CAPABILITY_BLOCKED") {
			const modStore = useModerationStore();
			const menuStore = useMenuStore();

			modStore.notifyCapabilityBlocked({
				capability: action,
				restriction: restriction,
			});

			menuStore.openMenu(Menu.ModerationMenu);
		} else if (reason && message) {
			toast(message, { color: "danger", duration: ToastDuration.long });
		} else {
			toast(`Unknown error: ${reason || "Connection failed"}`, {
				color: "danger",
			});
		}

		leaveRoom(true);
	});

	socket.on(
		"request-canvas-state",
		async ({
			targetSocketId,
			snapshotSequenceId,
			isBackgroundUpdate,
			uploadUrl,
			fetchUrl,
		}) => {
			const { getCanvas } = useDrawStore();
			const canvas = getCanvas();
			if (!canvas) return;

			const canvasString = JSON.stringify(canvas.toJSON());
			const stream = new Blob([canvasString])
				.stream()
				.pipeThrough(new CompressionStream("gzip"));
			const compressedBuffer = await new Response(stream).arrayBuffer();
			const sizeKB = Math.round(compressedBuffer.byteLength / 1024);

			if (uploadUrl) {
				try {
					await fetch(uploadUrl, { method: "PUT", body: compressedBuffer });
					socket.emit("send-canvas-state", {
						targetSocketId,
						url: fetchUrl,
						sizeKB,
						snapshotSequenceId,
						isBackgroundUpdate,
					});
					return;
				} catch (e) {
					console.error(
						"Snapshot upload failed, falling back to buffer relay:",
						e,
					);
				}
			}

			// Legacy server, or upload failed: relay the buffer through the socket
			socket.emit("send-canvas-state", {
				targetSocketId,
				canvasState: compressedBuffer,
				sizeKB,
				snapshotSequenceId,
				isBackgroundUpdate,
			});
		},
	);

	socket.on("request-lobby-thumbnail", async (payload) => {
		const { uploadUrl, fetchUrl } = payload || {};
		const { getCanvas } = useDrawStore();
		const { roomId } = useDrawSyncer();
		const canvas = getCanvas();
		if (!canvas || !roomId) return;

		const result = await exportBoundingBoxImage(canvas, {
			maxSize: 400,
			asBuffer: true,
			quality: 0.6,
		});
		if (!result) return;

		if (uploadUrl) {
			try {
				await fetch(uploadUrl, { method: "PUT", body: result.img });
				socket.emit("send-lobby-thumbnail", {
					url: fetchUrl,
					aspectRatio: result.aspect_ratio,
					roomId,
				});
				return;
			} catch (e) {
				console.error(
					"Thumbnail upload failed, falling back to buffer relay:",
					e,
				);
			}
		}

		socket.emit("send-lobby-thumbnail", {
			thumbnailBuffer: result.img,
			aspectRatio: result.aspect_ratio,
			roomId,
		});
	});

	socket.on(
		"initial-canvas-state",
		async ({
			canvasState,
			canvasStateUrl,
			sequenceId,
			missedActions,
			isInitialSync,
		}) => {
			const engine = useDrawSyncEngine();
			const { isLoadingCanvas, lastProcessedSequenceId } = storeToRefs(
				useDrawSyncer(),
			);
			const mgr = useDrawObjectManager();
			mgr.beginLoading();

			if (sequenceId !== undefined) {
				lastProcessedSequenceId.value = sequenceId;
			}

			let decompressedString: string;
			try {
				let gzipBytes: ArrayBuffer | Uint8Array;
				if (canvasStateUrl) {
					const res = await fetch(canvasStateUrl);
					gzipBytes = await res.arrayBuffer();
				} else {
					gzipBytes = canvasState;
				}
				const blobBytes =
					gzipBytes instanceof Uint8Array
						? new Uint8Array(gzipBytes).buffer
						: gzipBytes;
				const stream = new Blob([blobBytes])
					.stream()
					.pipeThrough(new DecompressionStream("gzip"));
				decompressedString = await new Response(stream).text();
			} catch (e) {
				console.error("Failed to load canvas snapshot:", e);
				await mgr.endLoading();
				isLoadingCanvas.value = false;
				return;
			}

			const json = JSON.parse(decompressedString);
			await engine.loadRoomCanvas(json, isInitialSync);

			if (missedActions && missedActions.length > 0) {
				for (const item of missedActions) {
					if (isBlocked(item.userId)) continue;
					lastProcessedSequenceId.value = item.sequenceId;
					await engine.executeDrawSyncingAction(item);
				}
			}

			const { getCanvas } = useDrawStore();
			const canvas = getCanvas();

			await fitToDensestRegion(canvas);
			await mgr.endLoading();

			mgr.renderViewport();
			isLoadingCanvas.value = false;
		},
	);

	socket.on("missed-actions", async ({ actions, isInitialSync }) => {
		const engine = useDrawSyncEngine();
		const { isLoadingCanvas, lastProcessedSequenceId } = storeToRefs(
			useDrawSyncer(),
		);
		const mgr = useDrawObjectManager();
		mgr.beginLoading();

		if (isInitialSync) {
			const { reset } = useDrawStore();
			reset();
		}

		for (const item of actions) {
			if (isBlocked(item.userId)) continue;
			lastProcessedSequenceId.value = item.sequenceId;
			await engine.executeDrawSyncingAction(item);
		}

		const { getCanvas } = useDrawStore();
		const canvas = getCanvas();

		if (isInitialSync) {
			await fitToDensestRegion(canvas);
		}

		// endLoading owns the single index/reset/overview finalization pass.
		await mgr.endLoading();
		mgr.renderViewport();
		isLoadingCanvas.value = false;
	});

	socket.on("draw-event", async (data) => {
		const engine = useDrawSyncEngine();
		const { isLoadingCanvas, lastProcessedSequenceId } = storeToRefs(
			useDrawSyncer(),
		);

		if (isBlocked(data.creator)) return;

		if (data.sequenceId !== undefined) {
			lastProcessedSequenceId.value = data.sequenceId;
		}

		// Inject creator into params for the rendering engine
		if (data.action.params) {
			data.action.params.creator = data.creator;
		}

		if (isLoadingCanvas.value) {
			engine.addToDrawSyncingActionQueue(data.action);
		} else {
			await engine.executeDrawSyncingAction(data.action);
		}
	});

	socket.on(SOCKET_ENDPONTS.friend_invitation, async (data) => {
		const { invitations } = storeToRefs(useDrawSyncer());

		const updatedInvitations = invitations.value.filter(
			(inv) => inv.friend._id !== data.friend.id, // Note: Changed to !== to strip matching entries
		);

		updatedInvitations.push(data);

		invitations.value = updatedInvitations;
	});

	socket.on("lobby-message", async ({ message, member, timestamp, id }) => {
		const drawSyncer = useDrawSyncer();
		const authStore = useAuthStore();

		if (isBlocked(member.user_id || member._id)) {
			return;
		}

		const isMe = member._id === authStore.user?._id;

		if (isMe && id) {
			drawSyncer.resolveOptimisticLobbyMessage(id, {
				type: "message",
				message,
				member,
				timestamp,
				createdAt: timestamp,
				_id: id,
				status: "sent",
				isOptimistic: true,
			});
			return;
		}

		// If it's a message from someone else, just push it normally
		drawSyncer.pushLobbyItems([
			{
				type: "message",
				message,
				member,
				timestamp,
				createdAt: timestamp,
				_id: id,
				isOptimistic: false,
			},
		]);
	});

	socket.on("disconnect", () => {
		const store = useDrawSyncer();
		store.disconnectedRoomId = store.roomId;
	});

	socket.on("missed-lobby-messages", (missedMessages: LobbyChatItem[]) => {
		// `resort` matters here: this backfill appends but belongs earlier in
		// time, so it has to be ordered before the cap is applied.
		useDrawSyncer().pushLobbyItems(missedMessages, { resort: true });
	});

	// this will only trigger after relogging in aka reconnect
	socket.on(SOCKET_ENDPONTS.login, () => {
		const store = useDrawSyncer();
		if (store.disconnectedRoomId) {
			socketJoinRoom({
				roomId: store.disconnectedRoomId,
				intent: store.isCreator ? "create" : "join",
			});
			store.disconnectedRoomId = undefined;
		}
	});
}
