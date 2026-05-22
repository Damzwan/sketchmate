// ─── Types ─────────────────────────────────────────────────────────

export interface PresignedUrl {
	signedUrl: string;
	publicUrl: string;
	key: string;
}

export interface PresignedUploadBundle {
	drawing: PresignedUrl;
	image: PresignedUrl;
	thumbnail: PresignedUrl;
}

export interface UploadResult {
	drawing_url: string;
	image_url: string;
	thumbnail_url: string;
}

export interface BlobBundle {
	drawingBlob: Blob;
	imageBlob: Blob;
	thumbnailBlob: Blob;
}

// ─── Upload ────────────────────────────────────────────────────────

async function putBlob(url: string, blob: Blob): Promise<void> {
	const res = await fetch(url, {
		method: "PUT",
		body: blob,
		headers: { "Content-Type": blob.type },
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`Upload failed (${res.status}): ${text || url}`);
	}
}

export async function uploadAssets(
	urls: PresignedUploadBundle,
	blobs: BlobBundle,
): Promise<UploadResult> {
	await Promise.all([
		putBlob(urls.drawing.signedUrl, blobs.drawingBlob),
		putBlob(urls.image.signedUrl, blobs.imageBlob),
		putBlob(urls.thumbnail.signedUrl, blobs.thumbnailBlob),
	]);

	return {
		drawing_url: urls.drawing.publicUrl,
		image_url: urls.image.publicUrl,
		thumbnail_url: urls.thumbnail.publicUrl,
	};
}

import { compressImg } from "@/helper/general.helper";

export interface ExportedDrawingBlobs {
	drawingBlob: Blob;
	imageBlob: Blob;
	thumbnailBlob: Blob;
	aspect_ratio: number;
}

export interface DrawingExportInput {
	canvas: ArrayBuffer | string | object;
	img: ArrayBuffer | Blob;
	aspect_ratio?: number;
}

/**
 * Convert the raw exported canvas data into three upload-ready blobs:
 *   - drawingBlob:   gzipped canvas JSON  (application/gzip)
 *   - imageBlob:     full-res image       (image/webp)
 *   - thumbnailBlob: compressed thumbnail (image/webp)
 *
 * Single source of truth — every share path (mates / post / balloon) routes
 * through here so the export pipeline only lives in one place.
 */
export async function exportDrawingBlobs(
	data: DrawingExportInput,
): Promise<ExportedDrawingBlobs> {
	// 1. Gzip the canvas JSON
	const jsonString =
		typeof data.canvas === "string" ? data.canvas : JSON.stringify(data.canvas);

	const drawingStream = new Blob([jsonString])
		.stream()
		.pipeThrough(new CompressionStream("gzip"));
	const drawingBlob = await new Response(drawingStream).blob();

	// 2. Normalise image to a Blob
	const imageBlob =
		data.img instanceof Blob
			? data.img
			: new Blob([data.img], { type: "image/webp" });

	// 3. Thumbnail
	const thumbnailBlob = (await compressImg(imageBlob, {
		size: 500,
		quality: 0.7,
		returnType: "blob",
	})) as Blob;

	return {
		drawingBlob,
		imageBlob,
		thumbnailBlob,
		aspect_ratio: data.aspect_ratio ?? 1,
	};
}
