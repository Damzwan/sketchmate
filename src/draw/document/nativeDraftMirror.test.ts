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

import {
	awaitNativeDraftMirrors,
	listNativeDraftMetadata,
	queueNativeDraftMirror,
	readNativeDraft,
	removeNativeDraft,
} from "./nativeDraftMirror";

describe("native draft mirror", () => {
	beforeEach(() => {
		state.files.clear();
		state.ownerId = "owner-1";
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
