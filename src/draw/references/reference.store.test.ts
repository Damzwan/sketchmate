import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

vi.mock("@/store/auth.store", () => ({
	useAuthStore: () => ({ user: { _id: "me" } }),
}));

vi.mock("@/store/friend.store", () => ({
	useFriendStore: () => ({ isBlocked: () => false }),
}));

// Reactive: the real store's `isPro` is a ref, and `maxReferences` is a computed
// that would otherwise never see the tier change.
const subscription = reactive({ isPro: false });
vi.mock("@/store/subscription.store", () => ({
	useSubscriptionStore: () => subscription,
}));

const syncer = {
	roomId: "room-1" as string | undefined,
	roomMembers: [{ _id: "artist-1", name: "Ada" }] as any[],
	lobbyChatMessages: [] as any[],
	pushLobbyItems: (items: any[]) => syncer.lobbyChatMessages.push(...items),
};
vi.mock("@/draw/sync/session.store", () => ({
	useDrawSyncer: () => syncer,
}));

vi.mock("@/service/api/socket/socket.service", () => ({
	socket: { connected: true, emit: vi.fn() },
}));

vi.mock("@/service/toast.service", () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

import {
	FREE_REFERENCE_LIMIT,
	initialReferencePlacement,
	MAX_DRAWING_REFERENCES,
	type SharedDrawingReference,
	useDrawingReferenceStore,
} from "./reference.store";

const dataUrl = `data:image/webp;base64,${btoa("reference")}`;

function shared(
	overrides: Partial<SharedDrawingReference> = {},
): SharedDrawingReference {
	return {
		id: "ref-1",
		dataUrl,
		aspectRatio: 2,
		name: "Pose",
		ownerId: "artist-1",
		...overrides,
	};
}

function localReference(id: string) {
	return {
		...shared({ id, ownerId: "me" }),
		x: 12,
		y: 12,
		width: 200,
		opacity: 1,
		flipped: false,
		collapsed: false,
		hidden: false,
		shared: false,
		isLocal: true,
	};
}

describe("drawing reference store", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		subscription.isPro = false;
		syncer.lobbyChatMessages = [];
	});

	it("announces a peer's reference instead of opening it", () => {
		const store = useDrawingReferenceStore();
		store.applyRemoteReference(shared(), "artist-1");

		expect(store.references[0].hidden).toBe(true);
		expect(syncer.lobbyChatMessages).toMatchObject([
			{ type: "reference", referenceId: "ref-1", member: { _id: "artist-1" } },
		]);

		// Rejoin replays the same reference (snapshot, then the action backlog).
		store.applyRemoteReference(shared(), "artist-1");
		expect(syncer.lobbyChatMessages).toHaveLength(1);
	});

	it("opens your own reference and does not announce it", () => {
		const store = useDrawingReferenceStore();
		store.applyRemoteReference(shared({ ownerId: "me" }), "me");

		expect(store.references[0]).toMatchObject({ isLocal: true, hidden: false });
		expect(syncer.lobbyChatMessages).toHaveLength(0);
	});

	it("keeps the initial card inside the viewport", () => {
		const placement = initialReferencePlacement(2, 4, {
			width: 390,
			height: 700,
		});
		expect(placement.width).toBeLessThanOrEqual(340);
		expect(placement.x).toBeGreaterThanOrEqual(12);
		expect(placement.x + placement.width).toBeLessThanOrEqual(378);
		expect(placement.y).toBeGreaterThanOrEqual(12);
	});

	it("keeps a phone placement clear of notch, toolbars and home indicator", () => {
		const chrome = { top: 96, right: 64, bottom: 140, left: 0 };
		const viewport = { width: 390, height: 844 };
		const placement = initialReferencePlacement(2, 0, viewport, chrome, true);
		const height = placement.width / 2 + 38;

		expect(placement.y).toBeGreaterThanOrEqual(chrome.top + 12);
		expect(placement.y + height).toBeLessThanOrEqual(
			viewport.height - chrome.bottom - 12,
		);
		expect(placement.x).toBeGreaterThanOrEqual(12);
		expect(placement.x + placement.width).toBeLessThanOrEqual(
			viewport.width - chrome.right - 12,
		);
		// Centred in what is left, not parked in the occupied top right corner.
		expect(placement.y).toBeGreaterThan(viewport.height * 0.25);
	});

	it("staggers repeat placements without leaving the safe rect", () => {
		const chrome = { top: 96, right: 64, bottom: 140, left: 0 };
		const viewport = { width: 390, height: 844 };
		const first = initialReferencePlacement(2, 0, viewport, chrome, true);
		const second = initialReferencePlacement(2, 1, viewport, chrome, true);

		expect(second.x).toBeGreaterThan(first.x);
		expect(second.y).toBeGreaterThan(first.y);
		expect(second.x + second.width).toBeLessThanOrEqual(
			viewport.width - chrome.right - 12,
		);
	});

	it("preserves personal placement when the same shared reference is replayed", () => {
		const store = useDrawingReferenceStore();
		store.applyRemoteReference(shared(), "artist-1");
		store.updatePlacement("ref-1", { x: 23, y: 41, width: 250 });

		store.applyRemoteReference(shared({ name: "Updated pose" }), "artist-1");

		expect(store.references).toHaveLength(1);
		expect(store.references[0]).toMatchObject({
			x: 23,
			y: 41,
			width: 250,
			name: "Updated pose",
		});
	});

	it("ignores a collapsed viewport so a hidden draw page cannot move cards", () => {
		const store = useDrawingReferenceStore();
		store.applyRemoteReference(shared(), "artist-1");
		store.updatePlacement("ref-1", { x: 210, y: 320, width: 300 });

		store.clampToViewport({ width: 0, height: 0 });
		store.clampToViewport({ width: 1, height: 1 });

		expect(store.references[0]).toMatchObject({ x: 210, y: 320, width: 300 });
	});

	it("drops the owner's own reference when their removal is replayed", () => {
		const store = useDrawingReferenceStore();
		// What a rejoin looks like: the cached snapshot re-adds a reference the
		// owner already deleted, then the buffered removal replays behind it.
		store.applyRemoteReference(shared({ ownerId: "me" }), "me");
		expect(store.references[0].isLocal).toBe(true);

		store.applyRemoteRemoval("ref-1", "me");

		expect(store.references).toHaveLength(0);
	});

	it("gates added references on the tier, not on what peers shared", () => {
		const store = useDrawingReferenceStore();
		expect(store.maxReferences).toBe(FREE_REFERENCE_LIMIT);

		store.references = [localReference("mine-1")];
		expect(store.canAddReference).toBe(false);
		expect(store.atTierLimit).toBe(true);

		// A peer's shared reference is theirs, so it must not consume the tier.
		store.applyRemoteReference(shared(), "artist-1");
		expect(store.localCount).toBe(1);

		subscription.isPro = true;
		expect(store.maxReferences).toBe(MAX_DRAWING_REFERENCES);
		expect(store.canAddReference).toBe(true);
		expect(store.atTierLimit).toBe(false);
	});

	it("keeps a dismissed reference from coming back through any path", () => {
		const store = useDrawingReferenceStore();
		store.applyRemoteReference(shared(), "artist-1");

		store.dismiss("ref-1");
		expect(store.references).toHaveLength(0);

		// Live re-share, action replay, and the canvas snapshot in turn.
		store.applyRemoteReference(shared(), "artist-1");
		store.replaceRemoteSnapshot([shared()]);
		expect(store.references).toHaveLength(0);
	});

	it("purges a reported reference for the owner too, and after a rejoin", () => {
		const store = useDrawingReferenceStore();
		store.applyRemoteReference(shared({ ownerId: "me" }), "me");
		expect(store.references).toHaveLength(1);

		store.applyPurge(["ref-1"]);
		expect(store.references).toHaveLength(0);

		// Server re-states the purge on join; the snapshot behind it still has it.
		store.enterRoom("room-2", ["ref-1"]);
		store.replaceRemoteSnapshot([shared({ ownerId: "me" })]);
		expect(store.references).toHaveLength(0);
	});

	it("only lets the owning collaborator remove a remote reference", () => {
		const store = useDrawingReferenceStore();
		store.applyRemoteReference(shared(), "artist-1");

		store.applyRemoteRemoval("ref-1", "artist-2");
		expect(store.references).toHaveLength(1);

		store.applyRemoteRemoval("ref-1", "artist-1");
		expect(store.references).toHaveLength(0);
	});

	it("keeps local references private and removes remote ones on room exit", () => {
		const store = useDrawingReferenceStore();
		store.applyRemoteReference(shared(), "artist-1");
		store.references = [
			...store.references,
			{
				...shared({ id: "mine", ownerId: "me" }),
				x: 12,
				y: 12,
				width: 200,
				opacity: 1,
				flipped: false,
				collapsed: false,
				hidden: false,
				shared: true,
				isLocal: true,
			},
		];

		store.leaveRoom();

		expect(store.references).toHaveLength(1);
		expect(store.references[0]).toMatchObject({
			id: "mine",
			isLocal: true,
			shared: false,
		});
	});
});
