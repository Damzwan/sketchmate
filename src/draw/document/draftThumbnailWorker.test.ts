import { afterEach, describe, expect, it, vi } from "vitest";
import {
	renderDraftSnapshotInWorker,
	renderDraftThumbnailInWorker,
} from "./draftThumbnailWorker";

class FakeWorker {
	static latest: FakeWorker | null = null;
	onmessage: ((event: MessageEvent) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	posted: any = null;
	terminated = false;

	constructor() {
		FakeWorker.latest = this;
	}

	postMessage(message: any) {
		(this.posted ??= []).push(message);
	}

	terminate() {
		this.terminated = true;
	}
}

describe("draft thumbnail worker client", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		FakeWorker.latest = null;
	});

	it("returns the worker blob and releases the worker", async () => {
		vi.stubGlobal("Worker", FakeWorker);
		vi.stubGlobal("OffscreenCanvas", class {});

		const result = renderDraftThumbnailInWorker(
			{ objects: [{ id: "stroke" }] },
			{ maxSize: 640, quality: 0.72 },
		);
		const worker = FakeWorker.latest!;
		const blob = new Blob(["preview"], { type: "image/webp" });
		const jsonBlob = new Blob(['{"objects":[]}'], {
			type: "application/json",
		});
		worker.onmessage?.({
			data: { blob, jsonBlob },
		} as MessageEvent);

		await expect(result).resolves.toBe(blob);
		expect(worker.posted).toEqual([
			expect.objectContaining({
				type: "start",
				maxSize: 640,
				quality: 0.72,
				document: expect.objectContaining({ objects: undefined }),
			}),
			{ type: "append", objects: [{ id: "stroke" }] },
			{ type: "render" },
		]);
		expect(worker.terminated).toBe(true);
	});

	it("returns worker-serialized document JSON with the thumbnail", async () => {
		vi.stubGlobal("Worker", FakeWorker);
		vi.stubGlobal("OffscreenCanvas", class {});

		const result = renderDraftSnapshotInWorker(
			{ version: "7", background: "#fff", objects: [{ id: "stroke" }] },
			{ maxSize: 640, quality: 0.72 },
		);
		const worker = FakeWorker.latest!;
		const blob = new Blob(["preview"], { type: "image/webp" });
		const jsonBlob = new Blob(['{"version":"7","objects":[]}'], {
			type: "application/json",
		});
		worker.onmessage?.({
			data: { blob, jsonBlob },
		} as MessageEvent);

		await expect(result).resolves.toEqual({
			blob,
			jsonBlob,
		});
		expect(worker.terminated).toBe(true);
	});

	it("terminates immediately when the save is aborted", async () => {
		vi.stubGlobal("Worker", FakeWorker);
		vi.stubGlobal("OffscreenCanvas", class {});
		const controller = new AbortController();

		const result = renderDraftThumbnailInWorker(
			{ objects: [{ id: "stroke" }] },
			{ maxSize: 640, quality: 0.72, signal: controller.signal },
		);
		const worker = FakeWorker.latest!;
		controller.abort();

		await expect(result).rejects.toMatchObject({ name: "AbortError" });
		expect(worker.terminated).toBe(true);
	});
});
