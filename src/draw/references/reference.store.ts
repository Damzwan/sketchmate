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
import { ToastDuration } from "@/types/toast.types";
import { uuidv4 } from "@/utils/uuid";

export const MAX_DRAWING_REFERENCES = 12;
export const MAX_SHARED_DRAWING_REFERENCES = 6;
const MIN_REFERENCE_WIDTH = 120;
const MAX_REFERENCE_WIDTH = 560;
const REFERENCE_MARGIN = 12;
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

	const visibleReferences = computed(() =>
		references.value.filter((reference) => !reference.hidden),
	);
	const sharedCount = computed(
		() => references.value.filter((reference) => reference.shared).length,
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
		const available = Math.max(
			0,
			MAX_DRAWING_REFERENCES - references.value.length,
		);
		if (available === 0) {
			void useToast().toast("Remove a reference before adding another", {
				color: "warning",
			});
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
				`Only ${MAX_DRAWING_REFERENCES} references can be open at once`,
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

	function updatePlacement(
		id: string,
		changes: Partial<Pick<DrawingReference, "x" | "y" | "width">>,
	) {
		replaceReference(id, (current) => ({ ...current, ...changes }));
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
		references.value = references.value.map((reference) => {
			const width = clamp(
				reference.width,
				Math.min(MIN_REFERENCE_WIDTH, viewport.width - 24),
				Math.min(MAX_REFERENCE_WIDTH, viewport.width - 24),
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
		if (references.value.length >= MAX_DRAWING_REFERENCES) return;
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
				hidden: false,
				shared: true,
				isLocal,
			},
		];
	}

	function applyRemoteRemoval(id: string, creatorId?: string) {
		references.value = references.value.filter(
			(reference) =>
				reference.id !== id ||
				reference.isLocal ||
				reference.ownerId !== creatorId,
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

	function enterRoom(roomId: string) {
		if (activeRoomId === roomId) return;
		activeRoomId = roomId;
		references.value = references.value
			.filter((reference) => reference.isLocal)
			.map((reference) => ({ ...reference, shared: false }));
	}

	function leaveRoom() {
		activeRoomId = undefined;
		references.value = references.value
			.filter((reference) => reference.isLocal)
			.map((reference) => ({ ...reference, shared: false }));
	}

	function resetRuntimeState() {
		activeRoomId = undefined;
		references.value = [];
	}

	return {
		references,
		visibleReferences,
		sharedCount,
		addFiles,
		setShared,
		remove,
		updatePlacement,
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
