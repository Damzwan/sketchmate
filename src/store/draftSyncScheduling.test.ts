import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const state = vi.hoisted(() => ({
	isPro: false,
	pushed: [] as string[],
	appStateHandler: undefined as
		| ((s: { isActive: boolean }) => void)
		| undefined,
	drafts: new Map<string, { updatedAt: number }>(),
	syncStates: new Map<string, any>(),
	cloudFetches: 0,
	pullGate: undefined as Promise<void> | undefined,
	cloudPage: {
		drafts: [] as any[],
		deleted: [] as string[],
		cursor: 0,
		limit: 60,
		used: 0,
	},
}));

vi.mock("@capacitor/preferences", () => ({
	Preferences: {
		get: vi.fn(async () => ({ value: null })),
		set: vi.fn(async () => undefined),
	},
}));

vi.mock("@capacitor/app", () => ({
	App: {
		addListener: vi.fn(async (_event: string, handler: any) => {
			state.appStateHandler = handler;
			return { remove: vi.fn(async () => undefined) };
		}),
	},
}));

vi.mock("@/draw/document/nativeDraftMirror", () => ({
	noteCloudReplica: vi.fn(),
}));

vi.mock("@/service/draftSync.service", () => ({
	gzipBlob: vi.fn(async (blob: Blob) => ({ body: blob, compressed: true })),
	fetchDocumentBlob: vi.fn(async () => new Blob(["{}"])),
	toThumbnailBlob: vi.fn(async () => null),
	putToPresignedUrl: vi.fn(async () => undefined),
}));

vi.mock("@/service/api/cloudDraft.api", () => ({
	CloudDraftRejection: class extends Error {
		constructor(public code: string) {
			super(code);
		}
	},
	fetchCloudDrafts: vi.fn(async () => {
		state.cloudFetches += 1;
		await state.pullGate;
		return state.cloudPage;
	}),
	createCloudDraftTicket: vi.fn(async () => ({
		drawingUploadUrl: "https://s3.test/put",
		drawingKey: "drafts/u/d/rev.json.gz",
		thumbnailUploadUrl: "https://s3.test/put-thumb",
		thumbnailKey: "drafts/u/d/rev.webp",
	})),
	commitCloudDraft: vi.fn(async (id: string, body: any) => {
		state.pushed.push(id);
		return {
			draft_id: id,
			updated_at: body.updated_at,
			bytes: 0,
			thumbnail: "",
			drawing: "",
		};
	}),
	deleteCloudDraft: vi.fn(async () => undefined),
}));

vi.mock("@/store/auth.store", () => ({
	useAuthStore: () => ({ user: ref({ _id: "user-1" }) }),
}));

vi.mock("@/store/subscription.store", () => ({
	useSubscriptionStore: () => ({ isPro: ref(state.isPro) }),
}));

vi.mock("@/store/network.store", () => ({
	useNetworkStore: () => ({
		networkStatus: { connected: true, connectionType: "wifi" },
	}),
}));

vi.mock("@/draw/document/document.store", () => ({
	useDocumentStore: () => ({
		readDraftForUpload: vi.fn(async (id: string) => {
			const draft = state.drafts.get(id);
			if (!draft) return undefined;
			return {
				blob: new Blob(['{"objects":[]}']),
				updatedAt: draft.updatedAt,
				thumbnail: "",
			};
		}),
		readDraftSyncState: vi.fn(async (id: string) => state.syncStates.get(id)),
		getAllDraftSyncStates: vi.fn(async () => [...state.syncStates.values()]),
		writeDraftSyncState: vi.fn(async (next: any) => {
			state.syncStates.set(next.id, next);
		}),
		getAllDraftMetadata: vi.fn(async () => []),
		getDraftRevision: vi.fn(
			async (id: string) => state.drafts.get(id)?.updatedAt,
		),
		putRemoteDraft: vi.fn(async () => true),
		putRemoteDraftPlaceholder: vi.fn(async () => undefined),
		removeDraft: vi.fn(async () => undefined),
	}),
}));

import {
	notifyDraftSaved,
	notifyDrawSession,
} from "@/draw/document/draftEvents";
import { useDraftSyncStore } from "@/store/draftSync.store";

/** Lets queued microtasks (the pull, the drain) settle under fake timers. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("draft sync scheduling", () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		state.isPro = true;
		state.pushed = [];
		state.appStateHandler = undefined;
		state.drafts = new Map([["draft-1", { updatedAt: 1000 }]]);
		state.syncStates = new Map();
		state.cloudFetches = 0;
		state.pullGate = undefined;
		state.cloudPage = {
			drafts: [],
			deleted: [],
			cursor: 0,
			limit: 60,
			used: 0,
		};
		notifyDrawSession(false);
	});

	it("publishes a newly pulled cloud draft to retained views", async () => {
		state.cloudPage = {
			drafts: [
				{
					draft_id: "draft-from-device-a",
					updated_at: 2000,
					bytes: 42,
					thumbnail: "https://cdn.test/draft.webp",
					drawing: "https://cdn.test/draft.json.gz",
				},
			],
			deleted: [],
			cursor: 2000,
			limit: 60,
			used: 1,
		};

		const sync = useDraftSyncStore();
		await vi.waitFor(() =>
			expect(sync.remoteDraftMetadata.has("draft-from-device-a")).toBe(true),
		);

		expect(sync.remoteDraftMetadata.get("draft-from-device-a")).toMatchObject({
			updatedAt: 2000,
			remote: true,
		});
	});

	it("runs a fresh pull when refresh is pressed during startup sync", async () => {
		let releasePull!: () => void;
		state.pullGate = new Promise<void>((resolve) => {
			releasePull = resolve;
		});
		const sync = useDraftSyncStore();
		await vi.waitFor(() => expect(state.cloudFetches).toBe(1));

		const refreshed = sync.pull(true);
		releasePull();
		await refreshed;

		expect(state.cloudFetches).toBe(2);
	});

	it("holds a push back while the canvas is live, then spends it on exit", async () => {
		vi.useFakeTimers();
		try {
			useDraftSyncStore();
			await settle();

			notifyDrawSession(true);
			notifyDraftSaved("draft-1", 1000);

			// The normal 6 s debounce must NOT apply while drawing: an upload here
			// competes with the renderer for the main thread and the radio.
			await vi.advanceTimersByTimeAsync(30_000);
			expect(state.pushed).toEqual([]);

			// Leaving the canvas frees the main thread — after the teardown and
			// route transition have had their frames.
			notifyDrawSession(false);
			await vi.advanceTimersByTimeAsync(5_000);
			expect(state.pushed).toEqual(["draft-1"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("still pushes during a session that never ends", async () => {
		vi.useFakeTimers();
		try {
			useDraftSyncStore();
			await settle();

			notifyDrawSession(true);
			notifyDraftSaved("draft-1", 1000);

			// A marathon session would otherwise have nothing in the cloud if the
			// OS killed the process, so the safety net has to fire on its own.
			await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_000);
			expect(state.pushed).toEqual(["draft-1"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not let repeated saves drag the deadline earlier", async () => {
		vi.useFakeTimers();
		try {
			useDraftSyncStore();
			await settle();

			notifyDrawSession(true);
			// Autosave fires every couple of seconds during continuous drawing. If
			// each one reset the timer to the short debounce, the deferral would be
			// defeated by exactly the workload it exists for.
			for (let i = 0; i < 30; i++) {
				state.drafts.set("draft-1", { updatedAt: 1000 + i });
				notifyDraftSaved("draft-1", 1000 + i);
				await vi.advanceTimersByTimeAsync(2_000);
			}
			expect(state.pushed).toEqual([]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("pushes immediately when the app is backgrounded mid-session", async () => {
		vi.useFakeTimers();
		try {
			useDraftSyncStore();
			await settle();

			notifyDrawSession(true);
			notifyDraftSaved("draft-1", 1000);
			await vi.advanceTimersByTimeAsync(10_000);
			expect(state.pushed).toEqual([]);

			// Backgrounding is both the cheapest CPU in the app's life and the last
			// moment before Android may kill the process.
			state.appStateHandler?.({ isActive: false });
			await vi.advanceTimersByTimeAsync(100);
			expect(state.pushed).toEqual(["draft-1"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("pushes a queued draft out of the way when a canvas opens", async () => {
		vi.useFakeTimers();
		try {
			useDraftSyncStore();
			await settle();

			// Saved on home, so due in six seconds...
			notifyDraftSaved("draft-1", 1000);
			await vi.advanceTimersByTimeAsync(2_000);

			// ...and the user opens the drawing before it fires. Landing on top of
			// scene enliven and the first tile bake is the worst case there is.
			notifyDrawSession(true);
			await vi.advanceTimersByTimeAsync(30_000);
			expect(state.pushed).toEqual([]);

			notifyDrawSession(false);
			await vi.advanceTimersByTimeAsync(5_000);
			expect(state.pushed).toEqual(["draft-1"]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("uses the short debounce when no canvas is open", async () => {
		vi.useFakeTimers();
		try {
			useDraftSyncStore();
			await settle();

			notifyDraftSaved("draft-1", 1000);
			await vi.advanceTimersByTimeAsync(7_000);
			expect(state.pushed).toEqual(["draft-1"]);
		} finally {
			vi.useRealTimers();
		}
	});
});
