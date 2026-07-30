import type { Canvas } from "fabric";
import { exportBoundingBoxImage } from "@/draw/document/export";

const THUMBNAIL_MAX_SIZE = 640;
const THUMBNAIL_QUALITY = 0.72;

export async function createDraftThumbnail(
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
