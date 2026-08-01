export const INSERTED_IMAGE_MAX_DIMENSION = 256;

export function containImageDimensions(
	width: number,
	height: number,
	maxDimension = INSERTED_IMAGE_MAX_DIMENSION,
): { width: number; height: number } {
	if (!(width > 0) || !(height > 0)) {
		throw new Error("Image has invalid dimensions");
	}
	const scale = Math.min(1, maxDimension / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

function canvasToBlob(
	canvas: HTMLCanvasElement,
	type: string,
	quality: number,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Image encode failed"))),
			type,
			quality,
		);
	});
}

function blobToDataURL(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error ?? new Error("Image read failed"));
		reader.onload = () => resolve(reader.result as string);
		reader.readAsDataURL(blob);
	});
}

async function loadFallbackImage(blob: Blob): Promise<{
	source: HTMLImageElement;
	dispose: () => void;
}> {
	const objectURL = URL.createObjectURL(blob);
	const image = new Image();
	image.decoding = "async";
	image.src = objectURL;
	try {
		await image.decode();
	} catch (error) {
		URL.revokeObjectURL(objectURL);
		throw error;
	}
	return {
		source: image,
		dispose: () => {
			image.src = "";
			URL.revokeObjectURL(objectURL);
		},
	};
}

/**
 * Convert an arbitrary source into a small, self-contained WebP before Fabric
 * receives it. The full decoded source exists only during this function and is
 * explicitly released; Fabric, history, drafts and the renderer retain only
 * the bounded image.
 */
export async function downsampleImageToDataURL(
	sourceURL: string,
	maxDimension = INSERTED_IMAGE_MAX_DIMENSION,
): Promise<string> {
	const response = await fetch(sourceURL);
	if (!response.ok) throw new Error(`Image download failed (${response.status})`);
	const blob = await response.blob();

	let source: CanvasImageSource;
	let width: number;
	let height: number;
	let dispose: () => void;
	if (typeof createImageBitmap === "function") {
		const bitmap = await createImageBitmap(blob, {
			imageOrientation: "from-image",
		});
		source = bitmap;
		width = bitmap.width;
		height = bitmap.height;
		dispose = () => bitmap.close();
	} else {
		const fallback = await loadFallbackImage(blob);
		source = fallback.source;
		width = fallback.source.naturalWidth;
		height = fallback.source.naturalHeight;
		dispose = fallback.dispose;
	}

	const target = containImageDimensions(width, height, maxDimension);
	const canvas = document.createElement("canvas");
	canvas.width = target.width;
	canvas.height = target.height;
	const context = canvas.getContext("2d", { alpha: true });
	if (!context) {
		dispose();
		throw new Error("Image resize canvas unavailable");
	}

	try {
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = "high";
		context.drawImage(source, 0, 0, target.width, target.height);
		const resized = await canvasToBlob(canvas, "image/webp", 0.86);
		return await blobToDataURL(resized);
	} finally {
		dispose();
		context.clearRect(0, 0, canvas.width, canvas.height);
		canvas.width = 1;
		canvas.height = 1;
	}
}

/** Release full-resolution elements from legacy drafts/saved objects after
 * Fabric enlivening while preserving the object's world-space geometry. */
export async function downsampleFabricImagesInObject(root: any): Promise<boolean> {
	const pending = [root];
	let changed = false;
	while (pending.length) {
		const object = pending.pop();
		if (!object) continue;
		const children = object.getObjects?.();
		if (Array.isArray(children)) pending.push(...children);
		if (String(object.type).toLowerCase() !== "image") continue;

		const element = object.getElement?.() as
			| HTMLImageElement
			| HTMLCanvasElement
			| undefined;
		const sourceWidth = Number(
			(element as HTMLImageElement)?.naturalWidth || element?.width || 0,
		);
		const sourceHeight = Number(
			(element as HTMLImageElement)?.naturalHeight || element?.height || 0,
		);
		if (
			Math.max(sourceWidth, sourceHeight) <= INSERTED_IMAGE_MAX_DIMENSION
		) {
			continue;
		}

		const target = containImageDimensions(sourceWidth, sourceHeight);
		const canvas = document.createElement("canvas");
		canvas.width = target.width;
		canvas.height = target.height;
		const context = canvas.getContext("2d", { alpha: true });
		if (!context) continue;
		context.imageSmoothingEnabled = true;
		context.imageSmoothingQuality = "high";
		context.drawImage(element!, 0, 0, target.width, target.height);

		const resized = await canvasToBlob(canvas, "image/webp", 0.86);
		const dataURL = await blobToDataURL(resized);
		const replacement = new Image();
		replacement.decoding = "async";
		replacement.src = dataURL;
		await replacement.decode();

		const ratioX = target.width / sourceWidth;
		const ratioY = target.height / sourceHeight;
		const oldWidth = Number(object.width || sourceWidth);
		const oldHeight = Number(object.height || sourceHeight);
		const oldScaleX = Number(object.scaleX ?? 1);
		const oldScaleY = Number(object.scaleY ?? 1);
		object.setElement(replacement, {
			width: Math.max(1, oldWidth * ratioX),
			height: Math.max(1, oldHeight * ratioY),
		});
		object.set({
			cropX: Number(object.cropX ?? 0) * ratioX,
			cropY: Number(object.cropY ?? 0) * ratioY,
			scaleX: oldScaleX / ratioX,
			scaleY: oldScaleY / ratioY,
		});
		object.setCoords?.();
		if (
			typeof HTMLImageElement !== "undefined" &&
			element instanceof HTMLImageElement
		) {
			element.src = "";
		}
		context.clearRect(0, 0, canvas.width, canvas.height);
		canvas.width = 1;
		canvas.height = 1;
		changed = true;
	}
	return changed;
}
