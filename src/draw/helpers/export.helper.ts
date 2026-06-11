import { Canvas, StaticCanvas } from "fabric";
import { compressImg } from "@/helper/general.helper";
import { CANVAS_SIZE } from "@/draw/config/canvas.config";
import { createYielder, nextFrame } from "@/draw/helpers/yielding.helper";

export async function canvasToBuffer(canvasDataUrl: string, size = 1920) {
	return await (
		await compressImg(canvasDataUrl, { returnType: "blob", size: size })
	).arrayBuffer();
}

export async function createSketchFromDataURL(
	dataURL: string,
): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = "Anonymous";
		img.src = dataURL;

		img.onload = async () => {
			const filter = (bmp: ImageBitmap, filters = ""): HTMLCanvasElement => {
				const canvas = Object.assign(document.createElement("canvas"), {
					width: bmp.width,
					height: bmp.height,
				}) as HTMLCanvasElement;
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.filter = filters;
					ctx.drawImage(bmp, 0, 0);
				}
				return canvas;
			};

			const generateSketch = (
				bnw: HTMLCanvasElement,
				blur: HTMLCanvasElement,
			): HTMLCanvasElement => {
				const canvas = document.createElement("canvas");
				canvas.width = bnw.width;
				canvas.height = bnw.height;
				const ctx = canvas.getContext("2d");
				if (ctx) {
					ctx.drawImage(bnw, 0, 0, canvas.width, canvas.height);
					ctx.globalCompositeOperation = "color-dodge";
					ctx.drawImage(blur, 0, 0, canvas.width, canvas.height);
				}
				return canvas;
			};

			const bmp = await createImageBitmap(img);
			const bnw = filter(bmp, "grayscale(1)");
			const blur = filter(bmp, "grayscale(1) invert(1) blur(5px)");
			const sketchImg = generateSketch(bnw, blur);
			const sketchDataURL = sketchImg.toDataURL("image/png");
			resolve(sketchDataURL);
		};

		img.onerror = () => {
			reject(new Error("Failed to load image from Data URL"));
		};
	});
}

export async function exportBoundingBoxImage(
	canvas: Canvas,
	options: {
		maxSize?: number;
		asBuffer?: boolean;
		quality?: number;
		signal?: AbortSignal;
		asDataUrl?: boolean;
	} = {},
) {
	const settings = {
		maxSize: options.maxSize || 2000,
		asBuffer: options.asBuffer || false,
		asDataUrl: options.asDataUrl || false,
		quality: options.quality || 0.8,
		signal: options.signal,
	};

	return await exportWithMainThreadChunking(canvas, settings);
}

/**
 * Background-friendly export.
 *
 * Differences from previous version:
 *   • Uses a Yielder tied to RAF / isInputPending, not setTimeout(4).
 *   • When input is pending, yields a FULL animation frame so the browser
 *     can dispatch the event and paint before we resume rendering objects.
 *     This is the main reason exports used to make gestures laggy.
 *   • Tighter budget on mobile (4ms vs 8ms). One object's render() can blow
 *     the budget by itself — that's OK, we yield after.
 *   • Aggressive abort checks before each yield AND after each yield resolves.
 *     A new gesture or cancellation should reach the export within ~1 frame.
 */
async function exportWithMainThreadChunking(
	canvas: Canvas,
	options: {
		maxSize: number;
		asBuffer: boolean;
		quality: number;
		signal?: AbortSignal;
		asDataUrl?: boolean;
	},
): Promise<{ img: string | ArrayBuffer; aspect_ratio: number } | null> {
	const { signal } = options;
	const objects = canvas.getObjects();

	if (objects.length === 0) {
		const size = options.maxSize;
		const nativeCanvas = document.createElement("canvas");
		nativeCanvas.width = size;
		nativeCanvas.height = size;
		const ctx = nativeCanvas.getContext("2d");

		if (ctx) {
			ctx.fillStyle = canvas.backgroundColor as any;
			ctx.fillRect(0, 0, size, size);
		}

		return new Promise((resolve) => {
			nativeCanvas.toBlob(
				async (blob) => {
					if (!blob) return resolve(null);
					if (options.asBuffer) {
						resolve({ img: await blob.arrayBuffer(), aspect_ratio: 1 });
					} else if (options.asDataUrl) {
						const reader = new FileReader();
						reader.onloadend = () =>
							resolve({ img: reader.result as string, aspect_ratio: 1 });
						reader.readAsDataURL(blob);
					} else {
						resolve({ img: URL.createObjectURL(blob), aspect_ratio: 1 });
					}
				},
				options.asDataUrl ? "image/png" : "image/webp",
				options.quality,
			);
		});
	}

	// Tighter budgets — input responsiveness matters more than export speed.
	// The export still completes quickly; it just stops hogging the main thread.
	const IS_MOBILE =
		typeof navigator !== "undefined" &&
		/Mobi|Android/i.test(navigator.userAgent);
	const mathYielder = createYielder({ budgetMs: IS_MOBILE ? 4 : 6, signal });
	const renderYielder = createYielder({ budgetMs: IS_MOBILE ? 4 : 6, signal });

	// Defer one frame before starting — if the caller just kicked us off after
	// some UI event, this lets that event's paint finish first.
	await nextFrame();
	if (signal?.aborted) return null;

	// ── 1. Bounding box pass ──────────────────────────────────────────────────
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	mathYielder.reset();
	for (let i = 0; i < objects.length; i++) {
		if (signal?.aborted) return null;
		// @ts-ignore
		const bound = objects[i].getBoundingRect(true);
		if (bound.left < minX) minX = bound.left;
		if (bound.top < minY) minY = bound.top;
		if (bound.left + bound.width > maxX) maxX = bound.left + bound.width;
		if (bound.top + bound.height > maxY) maxY = bound.top + bound.height;

		if (mathYielder.shouldYield()) {
			await mathYielder.yield();
			if (signal?.aborted) return null;
		}
	}

	const padding = 50;
	const width = maxX + padding - (minX - padding);
	const height = maxY + padding - (minY - padding);
	const scale = Math.min(options.maxSize / width, options.maxSize / height);

	const nativeCanvas = document.createElement("canvas");
	nativeCanvas.width = width * scale;
	nativeCanvas.height = height * scale;
	const ctx = nativeCanvas.getContext("2d", { alpha: true });
	if (!ctx) return null;

	ctx.fillStyle = canvas.backgroundColor as any;
	ctx.fillRect(0, 0, nativeCanvas.width, nativeCanvas.height);
	ctx.save();
	ctx.scale(scale, scale);
	ctx.translate(-(minX - padding), -(minY - padding));

	const wasSkipOffscreen = canvas.skipOffscreen;
	canvas.skipOffscreen = false;

	// ── 2. Render pass ───────────────────────────────────────────────────────
	// Each obj.render() is synchronous and uncancellable — but we yield BEFORE
	// each one if budget/input demands it. So worst case: one heavy object runs,
	// then we yield, then input is processed, then we continue.
	renderYielder.reset();
	try {
		for (let i = 0; i < objects.length; i++) {
			if (signal?.aborted) return null;

			// Yield BEFORE rendering this object if needed. This is important: if
			// budget is already blown, we yield, let input dispatch, THEN render.
			// The alternative — yield after — means we always do one extra render
			// before responding to input.
			if (renderYielder.shouldYield()) {
				await renderYielder.yield();
				if (signal?.aborted) return null;
			}

			const obj = objects[i];
			const wasVisible = obj.visible;
			const wasObjectCaching = obj.objectCaching;
			obj.visible = true;
			obj.objectCaching = false;
			try {
				obj.render(ctx);
			} catch (e) {
				// eslint-disable-next-line no-console
				console.warn("[export] obj.render threw, skipping:", e);
			}
			obj.objectCaching = wasObjectCaching;
			obj.visible = wasVisible;
		}
	} finally {
		canvas.skipOffscreen = wasSkipOffscreen;
		ctx.restore();
	}

	if (signal?.aborted) return null;

	// ── 3. Encode ────────────────────────────────────────────────────────────
	// toBlob is itself off-main-thread for image encoding. We still wrap it
	// in a promise that respects the signal.
	return new Promise((resolve, reject) => {
		let aborted = false;
		const onAbort = () => {
			aborted = true;
			reject(new DOMException("Aborted", "AbortError"));
		};
		if (signal) {
			if (signal.aborted)
				return reject(new DOMException("Aborted", "AbortError"));
			signal.addEventListener("abort", onAbort, { once: true });
		}

		nativeCanvas.toBlob(
			async (blob) => {
				if (signal) signal.removeEventListener("abort", onAbort);
				if (aborted) return;
				if (!blob) return resolve(null);

				if (options.asBuffer) {
					return resolve({
						img: await blob.arrayBuffer(),
						aspect_ratio: width / height,
					});
				}
				if (options.asDataUrl) {
					const reader = new FileReader();
					// @ts-ignore
					reader.onloadend = () =>
						resolve({ img: reader.result, aspect_ratio: width / height });
					reader.readAsDataURL(blob);
					return;
				}
				resolve({
					img: URL.createObjectURL(blob),
					aspect_ratio: width / height,
				});
			},
			options.asDataUrl ? "image/png" : "image/webp",
			options.quality,
		);
	});
}

export function computeBounds(objects: any[], padding: number = 50) {
	let minX = Infinity,
		minY = Infinity;
	let maxX = -Infinity,
		maxY = -Infinity;

	for (const obj of objects) {
		const { left, top, width, height } = obj.getBoundingRect(true); // use true for absolute
		minX = Math.min(minX, left);
		minY = Math.min(minY, top);
		maxX = Math.max(maxX, left + width);
		maxY = Math.max(maxY, top + height);
	}

	return {
		minX: minX - padding,
		minY: minY - padding,
		width: maxX + padding - (minX - padding),
		height: maxY + padding - (minY - padding),
	};
}

export function relativeToAbsolute(bounds: any, rect: any) {
	return {
		left: bounds.minX + rect.x * bounds.width,
		top: bounds.minY + rect.y * bounds.height,
		width: rect.width * bounds.width,
		height: rect.height * bounds.height,
	};
}

/**
 * Background-friendly cropCanvas. Same yielding pattern as the main export.
 */
export async function cropCanvas(
	canvas: StaticCanvas,
	relativeRect: any,
	signal?: AbortSignal,
): Promise<{
	img: string;
	aspect_ratio: number;
} | null> {
	const objects = canvas?.getObjects();
	if (!canvas || !objects || objects.length === 0) return null;

	const totalBounds = computeBounds(objects);
	const absCrop = relativeToAbsolute(totalBounds, relativeRect);

	if (absCrop.width <= 0 || absCrop.height <= 0) return null;

	const maxPreviewTarget = 2000;
	const scale = Math.min(
		maxPreviewTarget / absCrop.width,
		maxPreviewTarget / absCrop.height,
	);

	const nativeCanvas = document.createElement("canvas");
	nativeCanvas.width = absCrop.width * scale;
	nativeCanvas.height = absCrop.height * scale;

	const ctx = nativeCanvas.getContext("2d", { alpha: true });
	if (!ctx) return null;

	ctx.fillStyle = canvas.backgroundColor as any;
	ctx.fillRect(0, 0, nativeCanvas.width, nativeCanvas.height);

	ctx.save();
	ctx.scale(scale, scale);
	ctx.translate(-absCrop.left, -absCrop.top);

	const IS_MOBILE =
		typeof navigator !== "undefined" &&
		/Mobi|Android/i.test(navigator.userAgent);
	const yielder = createYielder({ budgetMs: IS_MOBILE ? 4 : 6, signal });

	const wasSkipOffscreen = (canvas as any).skipOffscreen;
	(canvas as any).skipOffscreen = false;
	try {
		yielder.reset();
		for (const obj of objects) {
			if (signal?.aborted) return null;
			if (yielder.shouldYield()) {
				await yielder.yield();
				if (signal?.aborted) return null;
			}
			const wasVisible = obj.visible;
			const wasObjectCaching = obj.objectCaching;
			obj.visible = true;
			obj.objectCaching = false;
			try {
				obj.render(ctx);
			} catch (e) {
				// eslint-disable-next-line no-console
				console.warn("[cropCanvas] obj.render threw, skipping:", e);
			}
			obj.objectCaching = wasObjectCaching;
			obj.visible = wasVisible;
		}
	} finally {
		ctx.restore();
		(canvas as any).skipOffscreen = wasSkipOffscreen;
	}

	if (signal?.aborted) return null;

	return new Promise((resolve) => {
		nativeCanvas.toBlob(
			(blob) => {
				if (!blob) return resolve(null);
				resolve({
					img: URL.createObjectURL(blob),
					aspect_ratio: absCrop.width / absCrop.height,
				});
			},
			"image/webp",
			0.8,
		);
	});
}

export async function exportCroppedJson(
	canvas: Canvas | StaticCanvas,
	relativeRect: any,
	threshold = 0.3,
) {
	const objects = canvas?.getObjects();
	if (!canvas || !objects || objects.length === 0) return null;

	const totalBounds = computeBounds(objects);
	const absCrop = relativeToAbsolute(totalBounds, relativeRect);

	const keepObjects = objects.filter((obj) => {
		// @ts-ignore
		const b = obj.getBoundingRect(true);

		const xOverlap = Math.max(
			0,
			Math.min(b.left + b.width, absCrop.left + absCrop.width) -
				Math.max(b.left, absCrop.left),
		);
		const yOverlap = Math.max(
			0,
			Math.min(b.top + b.height, absCrop.top + absCrop.height) -
				Math.max(b.top, absCrop.top),
		);

		const intersectionArea = xOverlap * yOverlap;
		const objArea = b.width * b.height;

		return intersectionArea / objArea >= threshold;
	});

	if (keepObjects.length === 0) return null;

	const tempCanvas = new StaticCanvas(undefined, {
		width: absCrop.width,
		height: absCrop.height,
		backgroundColor: canvas.backgroundColor,
	});

	const clonedObjects = await Promise.all(
		keepObjects.map((obj) => obj.clone()),
	);

	const cropCenterX = absCrop.left + absCrop.width / 2;
	const cropCenterY = absCrop.top + absCrop.height / 2;
	const targetCenterX = CANVAS_SIZE / 2;
	const targetCenterY = CANVAS_SIZE / 2;

	const shiftX = targetCenterX - cropCenterX;
	const shiftY = targetCenterY - cropCenterY;

	clonedObjects.forEach((obj) => {
		obj.set({
			left: obj.left + shiftX,
			top: obj.top + shiftY,
		});
		tempCanvas.add(obj);
	});

	const jsonOutput = tempCanvas.toJSON();
	tempCanvas.dispose();

	return jsonOutput;
}
