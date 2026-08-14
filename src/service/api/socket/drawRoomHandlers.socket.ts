import { storeToRefs } from "pinia";
import type { Socket } from "socket.io-client";
import { useDrawObjectManager } from "@/draw/canvas/drawObjectManager";
import { fitToDensestRegion } from "@/draw/canvas/viewport";
import { useClaimArea } from "@/draw/claims/claimArea.store";
import { exportBoundingBoxImage } from "@/draw/document/export";
import { useLayersStore } from "@/draw/layers/layers.store";
import { useDrawStore } from "@/draw/session/draw.store";
import { useDrawSyncEngine } from "@/draw/sync/drawSyncEngine";
import { createRoomCanvasSnapshotBytes } from "@/draw/sync/roomSnapshot";
import { type LobbyChatItem, useDrawSyncer } from "@/draw/sync/session.store";
import {
	addRoomIdToUrl,
	leaveRoom,
	removeRoomIdFromUrl,
	socketJoinRoom,
} from "@/service/api/socket/drawSyncing.socket";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useMenuStore } from "@/store/menu.store";
import { useModerationStore } from "@/store/moderation.store";
import { Menu } from "@/types/menu.types";
import { SOCKET_ENDPONTS } from "@/types/server.types";
import { ToastDuration } from "@/types/toast.types";

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
			// PUBLIC: every peer — creator or joiner — installs the fixed set here.
			// Deriving it from `init` alone is not enough: a URL/deep-link join opens
			// the canvas before `isPublic` is known (it is only known now), and the
			// cold-start `missed-actions` path reloads no canvas at all, so `init`
			// may never run again. The set is a local constant, so applying it on
			// every peer is idempotent.
			//
			// PRIVATE: only the creator, whose already-open drawing must be promoted
			// into replicated mode. A joiner's document arrives with the snapshot and
			// must not be clobbered by the local one.
			// A private joiner only enables replication; its document is whatever the
			// snapshot brings (or, when the server replays actions instead of sending
			// one, whatever is already open).
			if (isPublic) useLayersStore().adoptCurrentDocumentForRoom(true);
			else if (isCreator) useLayersStore().adoptCurrentDocumentForRoom(false);
			else useLayersStore().markRoomShared();
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
		} else if (reason === "PARENTAL_LOCKED") {
			// Server backstop for the client-side parental gate: reachable when a
			// parent switched rooms off on another device mid-session.
			toast(message || "A parent or guardian needs to turn this on first.", {
				color: "warning",
				duration: ToastDuration.long,
			});
		} else if (reason === "AGE_RESTRICTED") {
			toast("Public lobbies are available from age 13.", {
				color: "warning",
				duration: ToastDuration.long,
			});
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

			// Yielded serialize + worker gzip. Doing this inline used to be three
			// un-yielded whole-board passes on the main thread, several times a
			// minute — see docs/DRAW_ENGINE_HARDENING_PLAN.md → F1.
			const compressedBuffer = await createRoomCanvasSnapshotBytes(canvas);
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
			const { roomId } = storeToRefs(useDrawSyncer());
			// The room this payload belongs to. Every await below is a window in
			// which the user can leave (or join somewhere else), and applying a dead
			// room's snapshot over the canvas they are now looking at is worse than
			// dropping it.
			const joinedRoom = roomId.value;
			const stillInRoom = () => roomId.value === joinedRoom;

			mgr.beginLoading();
			// EVERYTHING after beginLoading lives in the try. `endLoading` is what
			// lifts the render engine's loading gate and decrements a counter that
			// outlives the session; missing it once left the canvas permanently
			// unable to draw — the "left a lobby mid-join and now nothing works".
			try {
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
					return;
				}

				if (!stillInRoom()) return;

				const json = JSON.parse(decompressedString);
				await engine.loadRoomCanvas(json, isInitialSync);

				if (missedActions && missedActions.length > 0) {
					for (const item of missedActions) {
						if (!stillInRoom()) return;
						if (isBlocked(item.userId)) continue;
						lastProcessedSequenceId.value = item.sequenceId;
						await engine.executeDrawSyncingAction(item);
					}
				}

				if (!stillInRoom()) return;

				const { getCanvas } = useDrawStore();
				await fitToDensestRegion(getCanvas());
			} catch (e) {
				console.error("Room canvas load failed:", e);
			} finally {
				await mgr.endLoading().catch(() => undefined);
				mgr.renderViewport();
				isLoadingCanvas.value = false;
			}
		},
	);

	socket.on("missed-actions", async ({ actions, isInitialSync }) => {
		const engine = useDrawSyncEngine();
		const { isLoadingCanvas, lastProcessedSequenceId } = storeToRefs(
			useDrawSyncer(),
		);
		const mgr = useDrawObjectManager();
		const { roomId } = storeToRefs(useDrawSyncer());
		const joinedRoom = roomId.value;
		const stillInRoom = () => roomId.value === joinedRoom;

		mgr.beginLoading();
		// Same contract as `initial-canvas-state`: whatever happens in here, the
		// loading gate must come back down exactly once.
		try {
			if (isInitialSync) {
				const { reset } = useDrawStore();
				reset();
			}

			for (const item of actions) {
				if (!stillInRoom()) return;
				if (isBlocked(item.userId)) continue;
				lastProcessedSequenceId.value = item.sequenceId;
				await engine.executeDrawSyncingAction(item);
			}

			if (isInitialSync && stillInRoom()) {
				const { getCanvas } = useDrawStore();
				await fitToDensestRegion(getCanvas());
			}
		} catch (e) {
			console.error("Missed-action replay failed:", e);
		} finally {
			// endLoading owns the single index/reset/overview finalization pass.
			await mgr.endLoading().catch(() => undefined);
			mgr.renderViewport();
			isLoadingCanvas.value = false;
		}
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

	// `message_filtered` has to be destructured explicitly — anything not named
	// here is dropped before the item reaches the store, which is why the word
	// filter had no effect in rooms.
	socket.on(
		"lobby-message",
		async ({ message, message_filtered, member, timestamp, id }) => {
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
					message_filtered,
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
					message_filtered,
					member,
					timestamp,
					createdAt: timestamp,
					_id: id,
					isOptimistic: false,
				},
			]);
		},
	);

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
