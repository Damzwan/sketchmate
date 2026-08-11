import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	files: new Map<string, string>(),
	ownerId: "owner-1",
}));

vi.mock("@capacitor/core", () => ({
	Capacitor: { isNativePlatform: () => true },
}));

vi.mock("@capacitor/preferences", () => ({
	Preferences: {
		get: vi.fn(async () => ({ value: state.ownerId })),
	},
}));

vi.mock("@capacitor/filesystem", () => ({
	Directory: { Data: "DATA" },
	Encoding: { UTF8: "utf8" },
	Filesystem: {
		writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
			state.files.set(path, data);
			return { uri: path };
		}),
		readFile: vi.fn(async ({ path }: { path: string }) => {
			const data = state.files.get(path);
			if (data === undefined) throw new Error("missing");
			return { data };
		}),
		deleteFile: vi.fn(async ({ path }: { path: string }) => {
			if (!state.files.delete(path)) throw new Error("missing");
		}),
		rename: vi.fn(async ({ from, to }: { from: string; to: string }) => {
			const matches = [...state.files.entries()].filter(
				([path]) => path === from || path.startsWith(`${from}/`),
			);
			if (!matches.length) throw new Error("missing");
			for (const [path, data] of matches) {
				state.files.delete(path);
				state.files.set(`${to}${path.slice(from.length)}`, data);
			}
			return { uri: to };
		}),
		rmdir: vi.fn(async ({ path }: { path: string }) => {
			const matches = [...state.files.keys()].filter(
				(file) => file === path || file.startsWith(`${path}/`),
			);
			if (!matches.length) throw new Error("missing");
			for (const file of matches) state.files.delete(file);
		}),
		readdir: vi.fn(async ({ path }: { path: string }) => {
			const names = new Set<string>();
			for (const file of state.files.keys()) {
				if (!file.startsWith(`${path}/`)) continue;
				names.add(file.slice(path.length + 1).split("/")[0]);
			}
			if (!names.size) throw new Error("missing");
			return {
				files: [...names].map((name) => ({ name, type: "directory" })),
			};
		}),
	},
}));

import { Filesystem } from "@capacitor/filesystem";
import {
	awaitNativeDraftMirrors,
	listNativeDraftMetadata,
	noteCloudReplica,
	queueNativeDraftMirror,
	readNativeDraft,
	removeNativeDraft,
} from "./nativeDraftMirror";

const drawingWrites = () =>
	vi
		.mocked(Filesystem.writeFile)
		.mock.calls.filter(([args]) => String(args.path).endsWith("/drawing.json"))
		.length;

describe("native draft mirror", () => {
	beforeEach(() => {
		state.files.clear();
		state.ownerId = "owner-1";
		vi.mocked(Filesystem.writeFile).mockClear();
	});

	it("rotates atomically and falls back to the previous readable revision", async () => {
		queueNativeDraftMirror({
			id: "draft-1",
			json: { objects: [{ id: "first" }] },
			updatedAt: 1,
			thumbnail: "thumb-1",
		});
		await awaitNativeDraftMirrors();

		queueNativeDraftMirror({
			id: "draft-1",
			json: { objects: [{ id: "second" }] },
			updatedAt: 2,
			thumbnail: "thumb-2",
		});
		await awaitNativeDraftMirrors();

		expect(JSON.parse((await readNativeDraft("draft-1"))!.json)).toMatchObject({
			objects: [{ id: "second" }],
		});
		expect(await listNativeDraftMetadata()).toMatchObject([
			{ id: "draft-1", ownerId: "owner-1", updatedAt: 2 },
		]);

		state.files.set(
			"SketchMate/drafts/draft-1/current/drawing.json",
			"not-json",
		);
		const recovered = await readNativeDraft("draft-1");
		expect(recovered?.updatedAt).toBe(1);
		expect(JSON.parse(recovered!.json)).toMatchObject({
			objects: [{ id: "first" }],
		});
	});

	it("throttles repeated mirrors and still lands the newest payload", async () => {
		vi.useFakeTimers();
		try {
			queueNativeDraftMirror({
				id: "draft-3",
				json: { objects: [{ id: "a" }] },
				updatedAt: 1,
				thumbnail: "",
			});
			await awaitNativeDraftMirrors();
			expect(drawingWrites()).toBe(1);

			// Two more autosaves inside the throttle window. Neither may touch the
			// filesystem — that repeated whole-document bridge write is the cost
			// the throttle exists to remove.
			queueNativeDraftMirror({
				id: "draft-3",
				json: { objects: [{ id: "b" }] },
				updatedAt: 2,
				thumbnail: "",
			});
			queueNativeDraftMirror({
				id: "draft-3",
				json: { objects: [{ id: "c" }] },
				updatedAt: 3,
				thumbnail: "",
			});
			expect(drawingWrites()).toBe(1);

			await vi.advanceTimersByTimeAsync(30_000);
			await awaitNativeDraftMirrors();

			// One trailing write, carrying the LAST revision rather than the one
			// that happened to schedule it.
			expect(drawingWrites()).toBe(2);
			expect(
				JSON.parse((await readNativeDraft("draft-3"))!.json),
			).toMatchObject({ objects: [{ id: "c" }] });
		} finally {
			vi.useRealTimers();
		}
	});

	it("forces a mirror on exit and drops throttled work when discarded", async () => {
		vi.useFakeTimers();
		try {
			queueNativeDraftMirror({
				id: "draft-4",
				json: { objects: [{ id: "a" }] },
				updatedAt: 1,
				thumbnail: "",
			});
			await awaitNativeDraftMirrors();

			// Exit cannot wait for the throttle: the process may be gone by then.
			queueNativeDraftMirror(
				{
					id: "draft-4",
					json: { objects: [{ id: "exit" }] },
					updatedAt: 2,
					thumbnail: "",
				},
				{ force: true },
			);
			await awaitNativeDraftMirrors();
			expect(drawingWrites()).toBe(2);

			// A throttled save followed by a discard must not resurrect the folder.
			queueNativeDraftMirror({
				id: "draft-4",
				json: { objects: [{ id: "late" }] },
				updatedAt: 3,
				thumbnail: "",
			});
			await removeNativeDraft("draft-4");
			await vi.advanceTimersByTimeAsync(60_000);
			await awaitNativeDraftMirrors();

			expect(await readNativeDraft("draft-4")).toBeNull();
			expect(drawingWrites()).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("backs off further as the document grows", async () => {
		vi.useFakeTimers();
		try {
			// ~4 MB: eight times the cheap threshold, so eight times the interval.
			const big = new Blob(['{"objects":[]}'.padEnd(4 * 1024 * 1024, " ")]);
			queueNativeDraftMirror({
				id: "draft-5",
				json: big,
				updatedAt: 1,
				thumbnail: "",
			});
			await awaitNativeDraftMirrors();
			expect(drawingWrites()).toBe(1);

			queueNativeDraftMirror({
				id: "draft-5",
				json: big,
				updatedAt: 2,
				thumbnail: "",
			});

			// The 30 s floor a small draft would get is not enough here.
			await vi.advanceTimersByTimeAsync(30_000);
			expect(drawingWrites()).toBe(1);

			await vi.advanceTimersByTimeAsync(240_000);
			await awaitNativeDraftMirrors();
			expect(drawingWrites()).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("skips a throttled write once the cloud holds that revision", async () => {
		vi.useFakeTimers();
		try {
			queueNativeDraftMirror({
				id: "draft-6",
				json: { objects: [{ id: "a" }] },
				updatedAt: 1,
				thumbnail: "",
			});
			await awaitNativeDraftMirrors();
			expect(drawingWrites()).toBe(1);

			queueNativeDraftMirror({
				id: "draft-6",
				json: { objects: [{ id: "b" }] },
				updatedAt: 2,
				thumbnail: "",
			});
			// Cloud sync confirms revision 2 before the trailing flush comes due.
			noteCloudReplica("draft-6", 2);
			await vi.advanceTimersByTimeAsync(60_000);
			await awaitNativeDraftMirrors();
			expect(drawingWrites()).toBe(1);

			// A revision the cloud does NOT have still gets mirrored.
			queueNativeDraftMirror({
				id: "draft-6",
				json: { objects: [{ id: "c" }] },
				updatedAt: 3,
				thumbnail: "",
			});
			await vi.advanceTimersByTimeAsync(60_000);
			await awaitNativeDraftMirrors();
			expect(drawingWrites()).toBe(2);
		} finally {
			vi.useRealTimers();
		}
	});

	it("does not expose another account's drafts and removes discarded copies", async () => {
		queueNativeDraftMirror({
			id: "draft-2",
			json: { objects: [] },
			updatedAt: 1,
			thumbnail: "",
		});
		await awaitNativeDraftMirrors();

		state.ownerId = "owner-2";
		expect(await readNativeDraft("draft-2")).toBeNull();
		expect(await listNativeDraftMetadata()).toEqual([]);

		state.ownerId = "owner-1";
		await removeNativeDraft("draft-2");
		expect(await readNativeDraft("draft-2")).toBeNull();
	});
});
