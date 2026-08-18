import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import type { DrawingDraftMetadata } from "@/draw/document/document.store";
import { useDraftThumbnails } from "./useDraftThumbnails";

let nextId = 0;
const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
	nextId = 0;
	created.length = 0;
	revoked.length = 0;
	vi.stubGlobal("URL", {
		createObjectURL: (_blob: Blob) => {
			const url = `blob:mock/${nextId++}`;
			created.push(url);
			return url;
		},
		revokeObjectURL: (url: string) => revoked.push(url),
	});
});

const webp = () =>
	new Blob([new Uint8Array([1, 2, 3])], { type: "image/webp" });

/** Runs the composable in a scope so disposal can be driven from the test. */
function mount(drafts: ReturnType<typeof ref<DrawingDraftMetadata[]>>) {
	const scope = effectScope();
	const result = scope.run(() =>
		useDraftThumbnails(drafts as any),
	) as ReturnType<typeof useDraftThumbnails>;
	return { ...result, stop: () => scope.stop() };
}

describe("draft thumbnails", () => {
	it("passes legacy and remote url thumbnails through without allocating", async () => {
		const drafts = ref<DrawingDraftMetadata[]>([
			{ id: "legacy", updatedAt: 1, thumbnail: "data:image/webp;base64,AA==" },
			{ id: "remote", updatedAt: 1, thumbnail: "https://cdn.test/a.webp" },
		]);
		const { thumbnailUrls } = mount(drafts);
		await nextTick();

		expect(thumbnailUrls.value.legacy).toBe("data:image/webp;base64,AA==");
		expect(thumbnailUrls.value.remote).toBe("https://cdn.test/a.webp");
		expect(created).toEqual([]);
	});

	it("reuses the url across refreshes that return an equal draft", async () => {
		const drafts = ref<DrawingDraftMetadata[]>([
			{ id: "a", updatedAt: 10, thumbnail: webp() },
		]);
		const { thumbnailUrls } = mount(drafts);
		await nextTick();
		const first = thumbnailUrls.value.a;
		expect(created).toHaveLength(1);

		// Re-reading IndexedDB yields a NEW Blob instance for identical bytes, so
		// reference equality would churn a url on every visit to Home.
		drafts.value = [{ id: "a", updatedAt: 10, thumbnail: webp() }];
		await nextTick();

		expect(thumbnailUrls.value.a).toBe(first);
		expect(created).toHaveLength(1);
		expect(revoked).toEqual([]);
	});

	it("revokes the previous url when a draft is saved again", async () => {
		const drafts = ref<DrawingDraftMetadata[]>([
			{ id: "a", updatedAt: 10, thumbnail: webp() },
		]);
		const { thumbnailUrls } = mount(drafts);
		await nextTick();
		const first = thumbnailUrls.value.a;

		drafts.value = [{ id: "a", updatedAt: 11, thumbnail: webp() }];
		await nextTick();
		await Promise.resolve();

		expect(thumbnailUrls.value.a).not.toBe(first);
		expect(revoked).toEqual([first]);
	});

	it("revokes everything it allocated when the list unmounts", async () => {
		const drafts = ref<DrawingDraftMetadata[]>([
			{ id: "a", updatedAt: 1, thumbnail: webp() },
			{ id: "b", updatedAt: 1, thumbnail: webp() },
		]);
		const { stop } = mount(drafts);
		await nextTick();
		expect(created).toHaveLength(2);

		// Without this the home screen leaks a WebP handle per card per visit.
		stop();
		expect(revoked.sort()).toEqual(created.sort());
	});

	it("drops the url of a draft that leaves the list", async () => {
		const drafts = ref<DrawingDraftMetadata[]>([
			{ id: "a", updatedAt: 1, thumbnail: webp() },
			{ id: "b", updatedAt: 1, thumbnail: webp() },
		]);
		const { thumbnailUrls } = mount(drafts);
		await nextTick();
		const goneUrl = thumbnailUrls.value.b;

		drafts.value = [{ id: "a", updatedAt: 1, thumbnail: webp() }];
		await nextTick();
		await Promise.resolve();

		expect(thumbnailUrls.value.b).toBeUndefined();
		expect(revoked).toEqual([goneUrl]);
	});
});
