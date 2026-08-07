import type { Canvas } from "fabric";
import {
	renderDraftSnapshotInWorker,
	renderDraftThumbnailInWorker,
	supportsDraftThumbnailWorker,
} from "@/draw/document/draftThumbnailWorker";
import { exportBoundingBoxImage } from "@/draw/document/export";

const THUMBNAIL_MAX_SIZE = 640;
const THUMBNAIL_QUALITY = 0.72;

export interface DraftSnapshotAssets {
	thumbnail: string;
	jsonBlob?: Blob;
}

export async function createDraftSnapshotAssets(
	canvas: Canvas,
	signal: AbortSignal | undefined,
	snapshotJson: any,
	snapshotBounds?: { x: number; y: number; w: number; h: number } | null,
): Promise<DraftSnapshotAssets> {
	if (snapshotJson && supportsDraftThumbnailWorker()) {
		const result = await renderDraftSnapshotInWorker(snapshotJson, {
			maxSize: THUMBNAIL_MAX_SIZE,
			quality: THUMBNAIL_QUALITY,
			signal,
			bounds: snapshotBounds,
		});
		if (result) {
			return {
				thumbnail: result.blob ? await blobToDataUrl(result.blob, signal) : "",
				jsonBlob: result.jsonBlob,
			};
		}
	}

	return {
		thumbnail: await createLocalDraftThumbnail(canvas, signal),
	};
}

export async function createDraftThumbnail(
	canvas: Canvas,
	signal?: AbortSignal,
	snapshotJson?: any,
	snapshotBounds?: { x: number; y: number; w: number; h: number } | null,
): Promise<string> {
	if (snapshotJson && supportsDraftThumbnailWorker()) {
		const blob = await renderDraftThumbnailInWorker(snapshotJson, {
			maxSize: THUMBNAIL_MAX_SIZE,
			quality: THUMBNAIL_QUALITY,
			signal,
			bounds: snapshotBounds,
		});
		if (blob) return await blobToDataUrl(blob, signal);
	}

	return createLocalDraftThumbnail(canvas, signal);
}

/** Render from detached document JSON without retaining the live Fabric canvas. */
export async function createDraftThumbnailFromJSON(
	snapshotJson: any,
	signal?: AbortSignal,
	snapshotBounds?: { x: number; y: number; w: number; h: number } | null,
): Promise<string> {
	if (!snapshotJson || !supportsDraftThumbnailWorker()) return "";
	const blob = await renderDraftThumbnailInWorker(snapshotJson, {
		maxSize: THUMBNAIL_MAX_SIZE,
		quality: THUMBNAIL_QUALITY,
		signal,
		bounds: snapshotBounds,
	});
	return blob ? await blobToDataUrl(blob, signal) : "";
}

async function createLocalDraftThumbnail(
	canvas: Canvas,
	signal?: AbortSignal,
): Promise<string> {
	const result = await exportBoundingBoxImage(canvas, {
		maxSize: THUMBNAIL_MAX_SIZE,
		quality: THUMBNAIL_QUALITY,
		asDataUrl: true,
		format: "image/webp",
		signal,
	});

	return typeof result?.img === "string" ? result.img : "";
}

function blobToDataUrl(blob: Blob, signal?: AbortSignal): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		const abort = () => {
			reader.abort();
			reject(new DOMException("Aborted", "AbortError"));
		};
		if (signal?.aborted) return abort();
		signal?.addEventListener("abort", abort, { once: true });
		reader.onerror = () => {
			signal?.removeEventListener("abort", abort);
			reject(reader.error ?? new Error("Could not read thumbnail"));
		};
		reader.onloadend = () => {
			signal?.removeEventListener("abort", abort);
			resolve(typeof reader.result === "string" ? reader.result : "");
		};
		reader.readAsDataURL(blob);
	});
}
