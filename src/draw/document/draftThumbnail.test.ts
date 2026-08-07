import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDraftThumbnail } from "@/draw/document/draftThumbnail";
import {
	renderDraftThumbnailInWorker,
	supportsDraftThumbnailWorker,
} from "@/draw/document/draftThumbnailWorker";
import { exportBoundingBoxImage } from "@/draw/document/export";

vi.mock("@/draw/document/export", () => ({
	exportBoundingBoxImage: vi.fn(),
}));
vi.mock("@/draw/document/draftThumbnailWorker", () => ({
	renderDraftThumbnailInWorker: vi.fn(),
	supportsDraftThumbnailWorker: vi.fn(),
}));

const exportImage = vi.mocked(exportBoundingBoxImage);
const renderInWorker = vi.mocked(renderDraftThumbnailInWorker);
const workerSupported = vi.mocked(supportsDraftThumbnailWorker);

describe("draft thumbnails", () => {
	beforeEach(() => {
		exportImage.mockReset();
		renderInWorker.mockReset();
		workerSupported.mockReset();
		workerSupported.mockReturnValue(false);
	});

	it("exports the document bounds as a compact data URL", async () => {
		const canvas = {} as never;
		exportImage.mockResolvedValue({
			img: "data:image/webp;base64,preview",
			aspect_ratio: 1.5,
		});

		await expect(createDraftThumbnail(canvas)).resolves.toBe(
			"data:image/webp;base64,preview",
		);
		expect(exportImage).toHaveBeenCalledWith(canvas, {
			maxSize: 640,
			quality: 0.72,
			asDataUrl: true,
			format: "image/webp",
			signal: undefined,
		});
	});

	it("returns an empty thumbnail when exporting produces no image", async () => {
		exportImage.mockResolvedValue(null);

		await expect(createDraftThumbnail({} as never)).resolves.toBe("");
	});

	it("renders an existing JSON snapshot in a worker", async () => {
		workerSupported.mockReturnValue(true);
		renderInWorker.mockResolvedValue(
			new Blob(["preview"], { type: "image/webp" }),
		);
		class Reader {
			result: string | null = null;
			error: DOMException | null = null;
			onerror: (() => void) | null = null;
			onloadend: (() => void) | null = null;
			abort() {}
			readAsDataURL() {
				this.result = "data:image/webp;base64,worker";
				this.onloadend?.();
			}
		}
		vi.stubGlobal("FileReader", Reader);

		await expect(
			createDraftThumbnail({} as never, undefined, {
				objects: [{ id: "stroke" }],
			}),
		).resolves.toBe("data:image/webp;base64,worker");
		expect(renderInWorker).toHaveBeenCalledOnce();
		expect(exportImage).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});
