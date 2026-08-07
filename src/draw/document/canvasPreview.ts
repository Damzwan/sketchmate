import type { Canvas } from "fabric"; // Adjust based on your fabric version
import { ref } from "vue";
import {
	canvasToBuffer,
	cropCanvas,
	exportBoundingBoxImage,
	exportCroppedJson,
} from "@/draw/document/export";
import { generateChunkedJSON } from "@/draw/document/serialization";

export function useCanvasPreview() {
	const preview = ref<string>();
	const newPreview = ref<string>();
	const isLoading = ref<boolean>(false);

	let croppedRect: any;
	let abortController: AbortController | null = null;

	// Keep a reference to the original instead of cloning it
	let originalCanvas: Canvas | null = null;
	let aspect_ratio: number | undefined;

	// Store the chunked JSON here so we don't have to calculate it on send
	let cachedJson: any = null;

	// The in-flight preview generation, so getDataToSend can wait for it
	// instead of racing a heavy (gallery/swiper-loaded) canvas.
	let previewPromise: Promise<void> | null = null;

	function createPreview(canvas: Canvas): Promise<void> {
		previewPromise = runPreview(canvas);
		return previewPromise;
	}

	async function runPreview(canvas: Canvas) {
		if (abortController) {
			abortController.abort();
		}

		abortController = new AbortController();
		const { signal } = abortController;

		reset(false);
		isLoading.value = true;
		originalCanvas = canvas;

		try {
			// 1. Generate the image preview for the UI
			const res = await exportBoundingBoxImage(canvas, { signal });
			if (res) {
				preview.value = res.img as any;
				aspect_ratio = res?.aspect_ratio;
			}

			// 2. Generate the JSON in the background using your chunked yielder!
			// This happens while the user is looking at the UI, so it's ready when they hit "Send"
			cachedJson = await generateChunkedJSON(canvas, signal);
		} catch (err: any) {
			if (err.name === "AbortError") {
				console.log("Successfully cancelled preview generation.");
			} else {
				console.error("Preview error:", err);
			}
		} finally {
			if (!signal.aborted) {
				isLoading.value = false;
			}
		}
	}

	async function crop(rect: any) {
		if (!originalCanvas) return;

		if (rect.x === 0 && rect.y === 0 && rect.width === 1 && rect.height === 1) {
			newPreview.value = undefined;
			croppedRect = undefined;
			return;
		}

		croppedRect = rect;
		isLoading.value = true;

		// Pass the original canvas!
		// Assuming cropCanvas is non-destructive (uses dataURL with viewport/clipping)
		const result = await cropCanvas(originalCanvas, rect);
		if (!result) return;

		newPreview.value = result.img;
		aspect_ratio = result.aspect_ratio;
		isLoading.value = false;
	}

	function reset(handleAbort = true) {
		if (abortController && handleAbort) abortController.abort();
		preview.value = undefined;
		newPreview.value = undefined;
		originalCanvas = null;
		croppedRect = undefined;
		cachedJson = null;
		if (handleAbort) previewPromise = null;
	}

	async function getDataToSend() {
		// Wait for any in-flight preview so a fast tap (or a heavy, slow-to-load
		// gallery/swiper canvas) can't read half-built state.
		if (previewPromise) {
			try {
				await previewPromise;
			} catch {
				// fall through to the readiness check below
			}
		}

		if (!originalCanvas || !preview.value) {
			throw new Error("Canvas or preview not ready");
		}

		if (croppedRect && newPreview.value) {
			const [img, croppedCanvasJSON] = await Promise.all([
				canvasToBuffer(newPreview.value),
				exportCroppedJson(originalCanvas, croppedRect),
			]);
			return { canvas: croppedCanvasJSON, img, aspect_ratio };
		}

		const img = await canvasToBuffer(preview.value);
		const finalJson = cachedJson || (await generateChunkedJSON(originalCanvas));

		return { canvas: finalJson, img, aspect_ratio };
	}

	return {
		preview,
		newPreview,
		createPreview,
		crop,
		reset,
		getDataToSend,
		isLoading,
	};
}
