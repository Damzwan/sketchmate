import { compressImg } from "@/helper/image.helper";

export const MAX_REFERENCE_DATA_URL_CHARS = 380_000;

const COMPRESSION_ATTEMPTS = [
	{ size: 1_400, quality: 0.76 },
	{ size: 1_100, quality: 0.65 },
	{ size: 850, quality: 0.56 },
] as const;

/** The widest a reference card can be drawn (see MAX_REFERENCE_WIDTH). */
const MAX_CARD_CSS_WIDTH = 560;

/**
 * The largest edge worth keeping on THIS device.
 *
 * The data-url cap bounds the bytes on the wire; it does nothing about the
 * decoded bitmap, which is what a cheap phone actually runs out of: a 1400px
 * image is ~7MB of RGBA whatever the file size, and six of them open at once is
 * the difference between a slow session and a killed WebView. Nothing above the
 * card's own pixel size can ever be seen, so that is the budget — dropped again
 * on devices that report little memory.
 */
function decodeBudget(): number {
	if (typeof window === "undefined") return 1_400;
	const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
	const memory = (navigator as { deviceMemory?: number }).deviceMemory;
	const ceiling = memory !== undefined && memory <= 4 ? 900 : 1_400;
	return Math.min(ceiling, Math.round(MAX_CARD_CSS_WIDTH * ratio));
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () =>
			reject(reader.error ?? new Error("Image read failed"));
		reader.readAsDataURL(blob);
	});
}

function imageAspectRatio(src: string): Promise<number> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () =>
			resolve(
				Math.max(0.08, Math.min(12, image.naturalWidth / image.naturalHeight)),
			);
		image.onerror = () => reject(new Error("This image could not be opened"));
		image.src = src;
	});
}

export interface PreparedReferenceImage {
	dataUrl: string;
	aspectRatio: number;
	name: string;
}

/**
 * Bounds both decoded image memory and the room payload. References remain DOM
 * images; this one-off canvas conversion is performed by CompressorJS before
 * the image reaches the overlay and never touches the Fabric render pipeline.
 */
export async function prepareReferenceImage(
	file: File,
): Promise<PreparedReferenceImage> {
	if (!file.type.startsWith("image/")) {
		throw new Error("Please choose an image file");
	}

	let dataUrl = "";
	const budget = decodeBudget();
	for (const attempt of COMPRESSION_ATTEMPTS) {
		const compressed = await compressImg(file, {
			size: Math.min(attempt.size, budget),
			quality: attempt.quality,
			returnType: "blob",
		});
		dataUrl = await blobToDataUrl(compressed);
		if (dataUrl.length <= MAX_REFERENCE_DATA_URL_CHARS) break;
	}

	if (!dataUrl || dataUrl.length > MAX_REFERENCE_DATA_URL_CHARS) {
		throw new Error("This image is too detailed to share as a reference");
	}

	return {
		dataUrl,
		aspectRatio: await imageAspectRatio(dataUrl),
		name: file.name.slice(0, 100) || "Drawing reference",
	};
}

export function isSafeReferenceDataUrl(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= MAX_REFERENCE_DATA_URL_CHARS &&
		/^data:image\/(?:webp|png|jpeg);base64,/i.test(value)
	);
}
