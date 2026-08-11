import { describe, expect, it, vi } from "vitest";
import {
	fetchDocumentBlob,
	gzipBlob,
	toThumbnailBlob,
} from "./draftSync.service";

const textBlob = (text: string) =>
	new Blob([text], { type: "application/json" });

describe("draft sync transport", () => {
	it("round-trips a document through gzip without losing bytes", async () => {
		// Repetitive, like a real document: the point of gzipping at all is that
		// this shrinks by an order of magnitude before it hits the radio.
		const document = JSON.stringify({
			version: "6.0.0",
			objects: Array.from({ length: 400 }, (_, i) => ({
				type: "Path",
				id: `object-${i}`,
				path: [
					["M", 0, 0],
					["L", 10, 10],
				],
			})),
		});

		const { body, compressed } = await gzipBlob(textBlob(document));
		expect(compressed).toBe(true);
		expect(body.size).toBeLessThan(document.length / 4);

		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response(body, { status: 200 }));
		try {
			const restored = await fetchDocumentBlob("https://cdn.test/a/b.json.gz");
			expect(await restored.text()).toBe(document);
		} finally {
			fetchMock.mockRestore();
		}
	});

	it("passes a non-gzip url through untouched", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(
				new Response(textBlob('{"objects":[]}'), { status: 200 }),
			);
		try {
			const restored = await fetchDocumentBlob("https://cdn.test/a/b.json");
			expect(await restored.text()).toBe('{"objects":[]}');
		} finally {
			fetchMock.mockRestore();
		}
	});

	it("surfaces a failed download instead of writing an error page as a draft", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(new Response("nope", { status: 403 }));
		try {
			await expect(
				fetchDocumentBlob("https://cdn.test/a/b.json.gz"),
			).rejects.toThrow("403");
		} finally {
			fetchMock.mockRestore();
		}
	});

	it("passes a Blob thumbnail through without re-encoding it", async () => {
		const source = new Blob([new Uint8Array([1, 2, 3, 4])], {
			type: "image/webp",
		});
		// Identity, not a copy: this is the whole point of storing Blobs.
		await expect(toThumbnailBlob(source)).resolves.toBe(source);
	});

	it("decodes a legacy base64 thumbnail data url", async () => {
		const blob = await toThumbnailBlob("data:image/webp;base64,UklGRg==");
		expect(blob?.type).toBe("image/webp");
		expect(blob?.size).toBe(4);
	});

	it("refuses to re-upload a remote thumbnail url", async () => {
		// A CDN url reaches this path for a draft pulled from the cloud. Those
		// bytes are already in the bucket; fetching them to PUT them back would
		// be a pointless round trip.
		await expect(
			toThumbnailBlob("https://cdn.test/thumb.webp"),
		).resolves.toBeNull();
		await expect(toThumbnailBlob("")).resolves.toBeNull();
		await expect(toThumbnailBlob(undefined)).resolves.toBeNull();
	});
});
