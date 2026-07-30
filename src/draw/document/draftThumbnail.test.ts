import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportBoundingBoxImage } from "@/draw/document/export";
import { createDraftThumbnail } from "@/draw/document/draftThumbnail";

vi.mock("@/draw/document/export", () => ({
	exportBoundingBoxImage: vi.fn(),
}));

const exportImage = vi.mocked(exportBoundingBoxImage);

describe("draft thumbnails", () => {
	beforeEach(() => {
		exportImage.mockReset();
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
});
