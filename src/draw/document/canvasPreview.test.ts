import { beforeEach, describe, expect, it, vi } from "vitest";

// The real export/serialization modules drag fabric (and the app bootstrap)
// into the import graph; this suite is about the ordering of the async
// preview/crop handoff, not about pixels.
const canvasToBuffer = vi.fn(async (src: string) => `buffer:${src}`);
const cropCanvas = vi.fn();
const exportBoundingBoxImage = vi.fn(async () => ({
	img: "full-preview",
	aspect_ratio: 1,
}));
const exportCroppedJson = vi.fn(
	async (_canvas: unknown, _rect: unknown) => ({ cropped: true }) as unknown,
);

vi.mock("@/draw/document/export", () => ({
	canvasToBuffer: (src: string) => canvasToBuffer(src),
	cropCanvas: (canvas: unknown, rect: unknown) => cropCanvas(canvas, rect),
	exportBoundingBoxImage: () => exportBoundingBoxImage(),
	exportCroppedJson: (canvas: unknown, rect: unknown) =>
		exportCroppedJson(canvas, rect),
}));
vi.mock("@/draw/document/serialization", () => ({
	generateChunkedJSON: vi.fn(async () => ({ full: true })),
}));

const { useCanvasPreview } = await import("@/draw/document/canvasPreview");

/** Enough of a fabric canvas for the preview module's own bookkeeping. */
const fakeCanvas = { getObjects: () => [{}] } as any;
const RECT = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

beforeEach(() => {
	vi.clearAllMocks();
	canvasToBuffer.mockImplementation(async (src: string) => `buffer:${src}`);
	exportBoundingBoxImage.mockImplementation(async () => ({
		img: "full-preview",
		aspect_ratio: 1,
	}));
	exportCroppedJson.mockImplementation(async () => ({ cropped: true }));
});

describe("useCanvasPreview", () => {
	it("sends the crop when Send is tapped before the crop finishes", async () => {
		const preview = useCanvasPreview();
		await preview.createPreview(fakeCanvas);

		// Crop is still rendering when the user hits Send.
		const pendingCrop = deferred<{ img: string; aspect_ratio: number }>();
		cropCanvas.mockReturnValue(pendingCrop.promise);
		void preview.crop(RECT);

		const sent = preview.getDataToSend();
		pendingCrop.resolve({ img: "cropped-preview", aspect_ratio: 2 });

		const data = await sent;
		expect(data.img).toBe("buffer:cropped-preview");
		expect(data.canvas).toEqual({ cropped: true });
		expect(data.aspect_ratio).toBe(2);
		expect(exportCroppedJson).toHaveBeenCalledWith(fakeCanvas, RECT);
	});

	it("sends the uncropped drawing when no crop was made", async () => {
		const preview = useCanvasPreview();
		await preview.createPreview(fakeCanvas);

		const data = await preview.getDataToSend();
		expect(data.img).toBe("buffer:full-preview");
		expect(data.canvas).toEqual({ full: true });
		expect(exportCroppedJson).not.toHaveBeenCalled();
	});

	it("falls back to the uncropped drawing when the crop yields nothing", async () => {
		const preview = useCanvasPreview();
		await preview.createPreview(fakeCanvas);

		cropCanvas.mockResolvedValue(null);
		void preview.crop(RECT);

		const data = await preview.getDataToSend();
		expect(data.img).toBe("buffer:full-preview");
		expect(exportCroppedJson).not.toHaveBeenCalled();
		expect(preview.isLoading.value).toBe(false);
	});

	it("keeps the last crop when two crops overlap", async () => {
		const preview = useCanvasPreview();
		await preview.createPreview(fakeCanvas);

		const slowFirst = deferred<{ img: string; aspect_ratio: number }>();
		cropCanvas.mockReturnValueOnce(slowFirst.promise);
		void preview.crop(RECT);

		const secondRect = { x: 0.2, y: 0.2, width: 0.3, height: 0.3 };
		cropCanvas.mockResolvedValueOnce({
			img: "second-crop",
			aspect_ratio: 1,
		});
		await preview.crop(secondRect);

		// The stale first crop resolves last and must not clobber the second.
		slowFirst.resolve({ img: "first-crop", aspect_ratio: 3 });
		await preview.waitForPending();

		expect(preview.newPreview.value).toBe("second-crop");
		const data = await preview.getDataToSend();
		expect(data.img).toBe("buffer:second-crop");
		expect(exportCroppedJson).toHaveBeenCalledWith(fakeCanvas, secondRect);
	});

	it("resetting a full-frame crop drops the previous crop", async () => {
		const preview = useCanvasPreview();
		await preview.createPreview(fakeCanvas);

		cropCanvas.mockResolvedValue({ img: "cropped-preview", aspect_ratio: 2 });
		await preview.crop(RECT);
		await preview.crop({ x: 0, y: 0, width: 1, height: 1 });

		const data = await preview.getDataToSend();
		expect(data.img).toBe("buffer:full-preview");
		expect(exportCroppedJson).not.toHaveBeenCalled();
	});
});
