import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/store/auth.store", () => ({
	useAuthStore: () => ({ user: { _id: "me" } }),
}));

vi.mock("@/store/friend.store", () => ({
	useFriendStore: () => ({ isBlocked: () => false }),
}));

vi.mock("@/draw/sync/session.store", () => ({
	useDrawSyncer: () => ({ roomId: "room-1" }),
}));

vi.mock("@/service/api/socket/socket.service", () => ({
	socket: { connected: true, emit: vi.fn() },
}));

vi.mock("@/service/toast.service", () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

import {
	initialReferencePlacement,
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

describe("drawing reference store", () => {
	beforeEach(() => setActivePinia(createPinia()));

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
