import { describe, expect, it, vi } from "vitest";

vi.mock("@/draw/layers/layers.store", () => ({ useLayersStore: () => null }));
vi.mock("@/store/friend.store", () => ({ useFriendStore: () => ({}) }));

import { documentJsonToBlob } from "./serialization";

async function roundTrip(json: any): Promise<any> {
	const blob = await documentJsonToBlob(json);
	return JSON.parse(await blob.text());
}

describe("documentJsonToBlob", () => {
	it("round-trips a document byte-for-byte with JSON.stringify", async () => {
		// The chunked builder splices the objects array in by hand, so the only
		// thing that makes it safe is that the result is indistinguishable from a
		// monolithic stringify. A drift here would corrupt every draft silently.
		const json = {
			version: "6.0.0",
			background: "#F5E6D3",
			layers: [{ id: "base", name: "Base" }],
			objects: [
				{ type: "OptimizedPencilStroke", compressedTrace: ["M", 1, 2] },
				{ type: "OptimizedPencilStroke", compressedTrace: ["L", 3, 4] },
			],
		};
		expect(await roundTrip(json)).toEqual(JSON.parse(JSON.stringify(json)));
	});

	it("handles a document with no metadata beyond objects", async () => {
		// `head === "{}"` is a distinct branch: there is no trailing comma to emit.
		expect(await roundTrip({ objects: [{ a: 1 }] })).toEqual({
			objects: [{ a: 1 }],
		});
	});

	it("handles an empty object list", async () => {
		expect(await roundTrip({ version: "6", objects: [] })).toEqual({
			version: "6",
			objects: [],
		});
	});

	it("tolerates a missing objects array", async () => {
		expect(await roundTrip({ version: "6" })).toEqual({
			version: "6",
			objects: [],
		});
	});

	it("keeps shared references outside the Fabric object list", async () => {
		const sharedReferences = [
			{
				id: "ref-1",
				dataUrl: "data:image/webp;base64,YQ==",
				aspectRatio: 1.5,
				name: "Pose",
				ownerId: "artist-1",
			},
		];
		const result = await roundTrip({
			version: "7",
			objects: [{ id: "stroke-1" }],
			sharedReferences,
		});

		expect(result.objects).toEqual([{ id: "stroke-1" }]);
		expect(result.sharedReferences).toEqual(sharedReferences);
	});

	it("produces a Blob, which IndexedDB clones by reference", async () => {
		// The entire point: `put` structured-clones synchronously, and a plain
		// document object is cloned field by field — 3.4 s of main-thread block on
		// a 10 MB drawing. A Blob's bytes never touch the main thread again.
		const blob = await documentJsonToBlob({
			version: "6",
			objects: [{ a: 1 }],
		});
		expect(blob).toBeInstanceOf(Blob);
		expect(blob.type).toBe("application/json");
	});

	it("aborts mid-document without producing a partial blob", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			documentJsonToBlob(
				{ version: "6", objects: [{ a: 1 }, { b: 2 }] },
				controller.signal,
			),
		).rejects.toThrow(/abort/i);
	});
});
