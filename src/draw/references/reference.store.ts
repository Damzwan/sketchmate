import { defineStore } from "pinia";
import { computed, shallowRef } from "vue";
import {
	type DrawChromeInsets,
	measureDrawChrome,
	NO_DRAW_CHROME,
	prefersCenteredPanel,
} from "@/draw/references/drawChrome";
import {
	isSafeReferenceDataUrl,
	prepareReferenceImage,
} from "@/draw/references/referenceImage";
import { useDrawSyncer } from "@/draw/sync/session.store";
import {
	type DrawSyncingAction,
	DrawSyncingEvent,
} from "@/draw/sync/sync.types";
import { socket } from "@/service/api/socket/socket.service";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useSubscriptionStore } from "@/store/subscription.store";
import { ToastDuration } from "@/types/toast.types";
import { uuidv4 } from "@/utils/uuid";

/**
 * Hard cap on how many references ONE artist can keep open, Pro included.
 * Every reference is a decoded image held for the whole session plus a card the
 * overlay hit-tests on every pointer move, so this bounds memory and input cost
 * the same way MAX_SOLO_LAYERS does — there is no tier worth selling past it.
 */
export const MAX_DRAWING_REFERENCES = 6;
/**
 * What a free account can ADD. Not what it can SEE: references shared by peers
 * never count against this, and a lapsed subscriber keeps whatever is already
 * open — only adding more is gated.
 */
export const FREE_REFERENCE_LIMIT = 1;
export const MAX_SHARED_DRAWING_REFERENCES = 6;
/**
 * Ceiling on the whole overlay, yours plus everyone else's. Peers' references
 * must not eat into your own allowance, so this is the sum rather than either
 * cap on its own.
 */
export const MAX_OPEN_REFERENCES =
	MAX_DRAWING_REFERENCES + MAX_SHARED_DRAWING_REFERENCES;
const MIN_REFERENCE_WIDTH = 120;
const MAX_REFERENCE_WIDTH = 560;
const REFERENCE_MARGIN = 12;
/** Below this the measured box is a hidden page, not a real (small) viewport. */
const MIN_CLAMP_VIEWPORT = 160;
/** Matches the drag header drawn above the image in ReferenceOverlay. */
const REFERENCE_HEADER_HEIGHT = 38;

export interface SharedDrawingReference {
	id: string;
	dataUrl: string;
	aspectRatio: number;
	name: string;
	ownerId: string;
}

export interface DrawingReference extends SharedDrawingReference {
	x: number;
	y: number;
	width: number;
	opacity: number;
	flipped: boolean;
	collapsed: boolean;
	hidden: boolean;
	shared: boolean;
	isLocal: boolean;
}

export interface ReferenceViewport {
	width: number;
	height: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function currentViewport(): ReferenceViewport {
	return {
		width: Math.max(320, globalThis.innerWidth || 320),
		height: Math.max(320, globalThis.innerHeight || 320),
	};
}

/**
 * Corner placement only works where the corners are free. On a phone the top
 * right holds the status bar, the notch and the toolbar, so a reference parked
 * there arrives half-unreachable; centring it in the chrome-free rect makes it
 * fully visible and grabbable from either hand, and the first drag puts it
 * wherever the artist wants it anyway.
 */
export function initialReferencePlacement(
	aspectRatio: number,
	index: number,
	viewport: ReferenceViewport,
	chrome: DrawChromeInsets = NO_DRAW_CHROME,
	preferCenter = false,
): Pick<DrawingReference, "x" | "y" | "width"> {
	const width = clamp(viewport.width * 0.34, 180, 340);
	const height = width / aspectRatio + REFERENCE_HEADER_HEIGHT;
	const stagger = (index % 5) * 18;

	const left = chrome.left + REFERENCE_MARGIN;
	const top = chrome.top + REFERENCE_MARGIN;
	const right = viewport.width - chrome.right - REFERENCE_MARGIN - width;
	const bottom = viewport.height - chrome.bottom - REFERENCE_MARGIN - height;

	const baseX = preferCenter ? (left + right) / 2 + stagger : right - stagger;
	const baseY = preferCenter ? (top + bottom) / 2 + stagger : top + stagger;

	return {
		x: clamp(baseX, left, Math.max(left, right)),
		y: clamp(baseY, top, Math.max(top, bottom)),
		width,
	};
}

function validSharedReference(value: unknown): value is SharedDrawingReference {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<SharedDrawingReference>;
	return (
		typeof candidate.id === "string" &&
		candidate.id.length > 0 &&
		candidate.id.length <= 100 &&
		isSafeReferenceDataUrl(candidate.dataUrl) &&
		typeof candidate.aspectRatio === "number" &&
		Number.isFinite(candidate.aspectRatio) &&
		candidate.aspectRatio >= 0.08 &&
		candidate.aspectRatio <= 12 &&
		typeof candidate.name === "string" &&
		candidate.name.length <= 100 &&
		typeof candidate.ownerId === "string" &&
		candidate.ownerId.length > 0 &&
		candidate.ownerId.length <= 100
	);
}

export const useDrawingReferenceStore = defineStore("drawingReferences", () => {
	const references = shallowRef<DrawingReference[]>([]);
	let activeRoomId: string | undefined;
	/**
	 * Ids this client refuses to show again this session: dismissed by hand, or
	 * purged by the server after a report. Checked on every inbound path because
	 * a reference can arrive from three of them (live action, action replay,
	 * canvas snapshot).
	 */
	const dismissed = new Set<string>();

	const visibleReferences = computed(() =>
		references.value.filter((reference) => !reference.hidden),
	);
	const sharedCount = computed(
		() => references.value.filter((reference) => reference.shared).length,
	);
	/** Only your own images are gated — a peer's shared reference is theirs. */
	const localCount = computed(
		() => references.value.filter((reference) => reference.isLocal).length,
	);
	const maxReferences = computed(() =>
		useSubscriptionStore().isPro
			? MAX_DRAWING_REFERENCES
			: FREE_REFERENCE_LIMIT,
	);
	const canAddReference = computed(
		() => localCount.value < maxReferences.value,
	);
	/**
	 * Out of references because of the TIER, not the hard cap — the only case
	 * where an upgrade is the answer (mirrors the layer sheet).
	 */
	const atTierLimit = computed(
		() => !canAddReference.value && localCount.value < MAX_DRAWING_REFERENCES,
	);

	function replaceReference(
		id: string,
		update: (current: DrawingReference) => DrawingReference,
	) {
		references.value = references.value.map((reference) =>
			reference.id === id ? update(reference) : reference,
		);
	}

	function emitReferenceAction(action: DrawSyncingAction): boolean {
		const roomId = useDrawSyncer().roomId;
		if (!roomId || !socket?.connected) return false;
		// The normal draw emitter has an undo rollback for oversized Fabric
		// actions. References need their own bounded path because they have no
		// history entry to undo.
		if (JSON.stringify(action).length > 600_000) return false;
		socket.emit("draw-event", { roomId, action });
		return true;
	}

	function wireReference(reference: DrawingReference): SharedDrawingReference {
		return {
			id: reference.id,
			dataUrl: reference.dataUrl,
			aspectRatio: reference.aspectRatio,
			name: reference.name,
			ownerId: reference.ownerId,
		};
	}

	async function addFiles(
		files: File[],
		shareWithRoom: boolean,
	): Promise<void> {
		const available = Math.max(0, maxReferences.value - localCount.value);
		if (available === 0) {
			void useToast().toast(
				atTierLimit.value
					? `Free accounts keep ${FREE_REFERENCE_LIMIT} reference open — Pro keeps ${MAX_DRAWING_REFERENCES}`
					: "Remove a reference before adding another",
				{ color: "warning" },
			);
			return;
		}

		const selected = files.slice(0, available);
		for (const file of selected) {
			const prepared = await prepareReferenceImage(file);
			const placement = initialReferencePlacement(
				prepared.aspectRatio,
				references.value.length,
				currentViewport(),
				measureDrawChrome(),
				prefersCenteredPanel(),
			);
			const reference: DrawingReference = {
				id: uuidv4(),
				...prepared,
				ownerId: String(useAuthStore().user?._id ?? "local"),
				...placement,
				opacity: 1,
				flipped: false,
				collapsed: false,
				hidden: false,
				shared: false,
				isLocal: true,
			};
			references.value = [...references.value, reference];
			if (shareWithRoom) setShared(reference.id, true);
		}

		if (selected.length < files.length) {
			void useToast().toast(
				`Only ${maxReferences.value} of your references can be open at once`,
				{ color: "warning" },
			);
		}
	}

	function setShared(id: string, shared: boolean): boolean {
		const reference = references.value.find((item) => item.id === id);
		if (!reference?.isLocal) return false;
		if (reference.shared === shared) return true;
		if (
			shared &&
			references.value.filter((item) => item.shared).length >=
				MAX_SHARED_DRAWING_REFERENCES
		) {
			void useToast().toast(
				`A room can show up to ${MAX_SHARED_DRAWING_REFERENCES} shared references`,
				{ color: "warning" },
			);
			return false;
		}

		const action: DrawSyncingAction = shared
			? {
					type: DrawSyncingEvent.ReferenceAdded,
					params: { reference: wireReference(reference) },
				}
			: {
					type: DrawSyncingEvent.ReferenceRemoved,
					params: { referenceId: id },
				};

		if (!emitReferenceAction(action)) {
			void useToast().toast("Reference could not be shared with the room", {
				color: "warning",
				duration: ToastDuration.long,
			});
			return false;
		}

		replaceReference(id, (current) => ({ ...current, shared }));
		return true;
	}

	function remove(id: string) {
		const reference = references.value.find((item) => item.id === id);
		if (!reference) return;
		if (reference.isLocal && reference.shared) {
			emitReferenceAction({
				type: DrawSyncingEvent.ReferenceRemoved,
				params: { referenceId: id },
			});
		}
		references.value = references.value.filter((item) => item.id !== id);
	}

	/**
	 * Throw away a peer's reference for good — the only lever that does not
	 * depend on anyone else agreeing.
	 *
	 * Hiding is not enough: the image is still decoded on the next tap, and the
	 * rejoin path re-adds it from the room snapshot. Remembering the id is what
	 * makes "I don't want to see that" stick for the session.
	 */
	function dismiss(id: string) {
		dismissed.add(id);
		references.value = references.value.filter((item) => item.id !== id);
	}

	/** Server-ordered removal (someone reported it). Applies to the owner too. */
	function applyPurge(referenceIds: string[]) {
		let hit = false;
		for (const id of referenceIds) {
			if (typeof id !== "string") continue;
			dismissed.add(id);
			if (references.value.some((item) => item.id === id)) hit = true;
		}
		if (hit) {
			references.value = references.value.filter(
				(item) => !dismissed.has(item.id),
			);
		}
	}

	function updatePlacement(
		id: string,
		changes: Partial<Pick<DrawingReference, "x" | "y" | "width">>,
	) {
		replaceReference(id, (current) => ({ ...current, ...changes }));
	}

	/**
	 * One pass for the whole set, because the caller is the pan/zoom path.
	 *
	 * `updatePlacement` per reference rebuilt the entire array per reference —
	 * O(n²) allocations for every `viewport:changed` event, on the frame budget
	 * of a gesture that is already the heaviest thing the canvas does.
	 */
	function updatePlacements(
		changes: Map<string, Partial<Pick<DrawingReference, "x" | "y" | "width">>>,
	) {
		if (changes.size === 0) return;
		references.value = references.value.map((reference) => {
			const change = changes.get(reference.id);
			return change ? { ...reference, ...change } : reference;
		});
	}

	function updateAppearance(
		id: string,
		changes: Partial<
			Pick<DrawingReference, "opacity" | "flipped" | "collapsed" | "hidden">
		>,
	) {
		replaceReference(id, (current) => ({
			...current,
			...changes,
			opacity:
				changes.opacity === undefined
					? current.opacity
					: clamp(changes.opacity, 0.15, 1),
		}));
	}

	function clampToViewport(viewport: ReferenceViewport) {
		// A draw page that is hidden rather than unmounted (Ionic does this while
		// SendHub is pushed over it) measures 0x0. Clamping to that box rewrites
		// every placement to the corner at a nonsense width, and there is no undo
		// for a reference placement, so a box too small to hold a card is ignored.
		if (
			!(viewport.width >= MIN_CLAMP_VIEWPORT) ||
			!(viewport.height >= MIN_CLAMP_VIEWPORT)
		) {
			return;
		}
		references.value = references.value.map((reference) => {
			const width = clamp(
				reference.width,
				MIN_REFERENCE_WIDTH,
				Math.max(
					MIN_REFERENCE_WIDTH,
					Math.min(MAX_REFERENCE_WIDTH, viewport.width - 24),
				),
			);
			const height = reference.collapsed
				? 38
				: width / reference.aspectRatio + 38;
			return {
				...reference,
				width,
				x: clamp(
					reference.x,
					REFERENCE_MARGIN,
					Math.max(REFERENCE_MARGIN, viewport.width - width - REFERENCE_MARGIN),
				),
				y: clamp(
					reference.y,
					REFERENCE_MARGIN,
					Math.max(
						REFERENCE_MARGIN,
						viewport.height - height - REFERENCE_MARGIN,
					),
				),
			};
		});
	}

	function applyRemoteReference(
		candidate: SharedDrawingReference,
		creatorId?: string,
	) {
		const ownerId = String(creatorId ?? candidate.ownerId ?? "");
		const normalized = { ...candidate, ownerId };
		if (!validSharedReference(normalized)) return;
		if (dismissed.has(normalized.id)) return;
		if (useFriendStore().isBlocked(ownerId)) return;

		const existing = references.value.find((item) => item.id === candidate.id);
		if (existing) {
			if (existing.ownerId !== ownerId) return;
			replaceReference(existing.id, (current) => ({
				...current,
				...normalized,
				shared: true,
			}));
			return;
		}
		if (references.value.length >= MAX_OPEN_REFERENCES) return;
		if (
			references.value.filter((reference) => reference.shared).length >=
			MAX_SHARED_DRAWING_REFERENCES
		)
			return;

		const placement = initialReferencePlacement(
			normalized.aspectRatio,
			references.value.length,
			currentViewport(),
			measureDrawChrome(),
			prefersCenteredPanel(),
		);
		const isLocal = ownerId === String(useAuthStore().user?._id ?? "");
		references.value = [
			...references.value,
			{
				...normalized,
				...placement,
				opacity: 1,
				flipped: false,
				collapsed: false,
				// Someone else's image does NOT open itself on your canvas. It is
				// announced in lobby chat and you decide; see announceSharedReference.
				hidden: !isLocal,
				shared: true,
				isLocal,
			},
		];
		if (!isLocal) announceSharedReference(normalized, ownerId);
	}

	/**
	 * Put a "shared a reference" row in the lobby chat — the only place the image
	 * is offered, and the only place it can be reported from.
	 *
	 * Keyed by reference id so the rejoin path (snapshot re-add, then the action
	 * backlog) announces each image once rather than once per replay. A peer we
	 * cannot name is not announced: the row's whole job is to say who, and the
	 * report it launches needs someone to report.
	 */
	function announceSharedReference(
		reference: SharedDrawingReference,
		ownerId: string,
	) {
		const syncer = useDrawSyncer();
		if (!syncer.roomId) return;
		const itemId = `reference-${reference.id}`;
		if (syncer.lobbyChatMessages.some((item) => item._id === itemId)) return;

		const member = syncer.roomMembers.find(
			(candidate) => String(candidate._id) === ownerId,
		);
		if (!member) return;

		syncer.pushLobbyItems([
			{
				type: "reference",
				referenceId: reference.id,
				referenceName: reference.name,
				member,
				timestamp: new Date().toISOString(),
				_id: itemId,
			},
		]);
	}

	/**
	 * Owner-scoped, NOT local-scoped. Sparing `isLocal` copies looks like it
	 * protects your own images from a peer, but ownership already does that —
	 * and it meant your own removal, replayed back to you after a rejoin, was
	 * skipped: the snapshot re-added the deleted reference and the replayed
	 * `ReferenceRemoved` refused to take it away again.
	 */
	function applyRemoteRemoval(id: string, creatorId?: string) {
		if (!creatorId) return;
		references.value = references.value.filter(
			(reference) =>
				reference.id !== id || reference.ownerId !== String(creatorId),
		);
	}

	function replaceRemoteSnapshot(candidates: unknown) {
		const shared = Array.isArray(candidates)
			? candidates.filter(validSharedReference)
			: [];
		const sharedIds = new Set(shared.map((reference) => reference.id));
		references.value = references.value.filter(
			(reference) => reference.isLocal || sharedIds.has(reference.id),
		);
		for (const reference of shared) {
			applyRemoteReference(reference, reference.ownerId);
		}
	}

	function serializeSharedReferences(): SharedDrawingReference[] {
		return references.value
			.filter((reference) => reference.shared)
			.map(wireReference);
	}

	function enterRoom(roomId: string, purgedReferenceIds: string[] = []) {
		if (activeRoomId !== roomId) {
			activeRoomId = roomId;
			// Dismissals are per room: they were about images in the room being
			// left, and the ids cannot recur.
			dismissed.clear();
			references.value = references.value
				.filter((reference) => reference.isLocal)
				.map((reference) => ({ ...reference, shared: false }));
		}
		// Seeded on every join, including a rejoin into the same room: the purge
		// may have happened while we were away, and the cached snapshot we are
		// about to load still contains the image.
		applyPurge(purgedReferenceIds);
	}

	function leaveRoom() {
		activeRoomId = undefined;
		dismissed.clear();
		references.value = references.value
			.filter((reference) => reference.isLocal)
			.map((reference) => ({ ...reference, shared: false }));
	}

	function resetRuntimeState() {
		activeRoomId = undefined;
		dismissed.clear();
		references.value = [];
	}

	return {
		references,
		visibleReferences,
		sharedCount,
		localCount,
		maxReferences,
		canAddReference,
		atTierLimit,
		addFiles,
		setShared,
		remove,
		dismiss,
		applyPurge,
		updatePlacement,
		updatePlacements,
		updateAppearance,
		clampToViewport,
		applyRemoteReference,
		applyRemoteRemoval,
		replaceRemoteSnapshot,
		serializeSharedReferences,
		enterRoom,
		leaveRoom,
		resetRuntimeState,
	};
});
