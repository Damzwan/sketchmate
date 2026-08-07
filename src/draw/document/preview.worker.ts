import { ClippingGroup } from "@erase2d/fabric";
import { classRegistry, util } from "fabric";
import { WORKER_FONTS } from "@/draw/config/workerFonts.config";
import { BucketFillPath } from "@/draw/utils/BucketFillPath";
import { CalligraphyStroke } from "@/draw/utils/brushes/CalligraphyBrush";
import { CharcoalStroke } from "@/draw/utils/brushes/CharcoalBrush";
import { CrayonStroke } from "@/draw/utils/brushes/CrayonBrush";
import { CircleStroke } from "@/draw/utils/brushes/CustomCircleBrush";
import { OptimizedEraserStroke } from "@/draw/utils/brushes/CustomEraserBrush";
import { OptimizedPencilStroke } from "@/draw/utils/brushes/CustomPencilBrush";
import { SprayStroke } from "@/draw/utils/brushes/CustomSprayBrush";
import { NeonStroke } from "@/draw/utils/brushes/NeonSignBrush";
import { PixelStroke } from "@/draw/utils/brushes/PixelBrush";
import { WaterColorStroke } from "@/draw/utils/brushes/WaterColorBrush";

interface PreviewStart {
	type: "start";
	background?: string;
	document?: Record<string, any>;
	maxSize: number;
	quality: number;
	bounds?: { x: number; y: number; w: number; h: number } | null;
}

type PreviewMessage =
	| PreviewStart
	| { type: "append"; objects: any[] }
	| { type: "render" };

const applyCanvasDisguise = (canvas: any) => {
	canvas.hasAttribute = () => false;
	canvas.getAttribute = () => null;
	canvas.setAttribute = () => {};
	canvas.removeAttribute = () => {};
	canvas.style = {};
	canvas.classList = {
		add: () => {},
		remove: () => {},
		contains: () => false,
		toggle: () => {},
	};
	canvas.addEventListener = () => {};
	canvas.removeEventListener = () => {};
	canvas.dir = "ltr";
	return canvas;
};

function imageElement() {
	const image: any = {
		style: {},
		_src: "",
		_bitmap: null as ImageBitmap | null,
		onload: null,
		onerror: null,
		width: 0,
		height: 0,
		naturalWidth: 0,
		naturalHeight: 0,
		complete: false,
		nodeType: 1,
		nodeName: "IMG",
		parentNode: null,
		ownerDocument: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		getAttribute: (name: string) => (name === "src" ? image._src : null),
		hasAttribute: () => false,
		setAttribute: () => {},
		classList: { add: () => {}, remove: () => {} },
	};
	Object.defineProperty(image, "src", {
		get: () => image._src,
		set: (value: string) => {
			image._src = value;
			if (!value) return;
			void fetch(value)
				.then((response) => response.blob())
				.then((blob) => createImageBitmap(blob))
				.then((bitmap) => {
					image._bitmap = bitmap;
					image.width = bitmap.width;
					image.height = bitmap.height;
					image.naturalWidth = bitmap.width;
					image.naturalHeight = bitmap.height;
					image.complete = true;
					image.onload?.();
				})
				.catch((error) => image.onerror?.(error));
		},
	});
	return image;
}

if (typeof document === "undefined") {
	const workerDocument: any = {
		createElement: (tag: string) => {
			if (tag === "canvas")
				return applyCanvasDisguise(new OffscreenCanvas(1, 1));
			if (tag === "img") {
				const image = imageElement();
				image.ownerDocument = workerDocument;
				return image;
			}
			return {};
		},
	};
	(globalThis as any).document = workerDocument;
	(globalThis as any).window = globalThis;
}

const brushes = [
	[OptimizedEraserStroke, "OptimizedEraserStroke"],
	[PixelStroke, "PixelStroke"],
	[CharcoalStroke, "CharcoalStroke"],
	[WaterColorStroke, "WaterColorStroke"],
	[CalligraphyStroke, "CalligraphyStroke"],
	[BucketFillPath, "BucketFillPath"],
	[OptimizedPencilStroke, "OptimizedPencilStroke"],
	[CircleStroke, CircleStroke.type],
	[SprayStroke, SprayStroke.type],
	[NeonStroke, NeonStroke.type],
	[CrayonStroke, CrayonStroke.type],
] as const;
brushes.forEach(([type, name]) => classRegistry.setClass(type as any, name));
classRegistry.setClass(ClippingGroup as any);

let fontsReady: Promise<void> | null = null;

function loadFonts(): Promise<void> {
	if (fontsReady) return fontsReady;
	fontsReady = (async () => {
		const fontSet = (self as any).fonts;
		if (!fontSet || typeof FontFace === "undefined") return;
		await Promise.allSettled(
			WORKER_FONTS.map(async ({ family, url, weight }) => {
				const face = new FontFace(family, `url(${url})`, {
					weight,
					style: "normal",
				});
				await face.load();
				fontSet.add(face);
			}),
		);
	})();
	return fontsReady;
}

function collectImages(object: any, output: any[] = []): any[] {
	if (!object) return output;
	if (object.type === "image" && object._element) output.push(object);
	const children =
		object._objects ??
		(typeof object.getObjects === "function" ? object.getObjects() : null);
	if (Array.isArray(children)) {
		for (const child of children) collectImages(child, output);
	}
	if (object.clipPath) collectImages(object.clipPath, output);
	return output;
}

async function waitForImages(objects: any[]): Promise<void> {
	const images = objects.flatMap((object) => collectImages(object));
	await Promise.all(
		images.map(
			(object) =>
				new Promise<void>((resolve) => {
					const element = object._element;
					if (element?._bitmap) return resolve();
					const previousLoad = element?.onload;
					const previousError = element?.onerror;
					if (element) {
						element.onload = () => {
							previousLoad?.();
							resolve();
						};
						element.onerror = (error: unknown) => {
							previousError?.(error);
							resolve();
						};
					} else {
						resolve();
					}
				}),
		),
	);
	for (const object of images) {
		if (object._element?._bitmap) object._element = object._element._bitmap;
	}
}

function drawingBounds(objects: any[]) {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const object of objects) {
		object.setCoords?.();
		const bounds = object.getBoundingRect();
		if (
			!Number.isFinite(bounds.left) ||
			!Number.isFinite(bounds.top) ||
			bounds.width <= 0 ||
			bounds.height <= 0
		) {
			continue;
		}
		minX = Math.min(minX, bounds.left);
		minY = Math.min(minY, bounds.top);
		maxX = Math.max(maxX, bounds.left + bounds.width);
		maxY = Math.max(maxY, bounds.top + bounds.height);
	}
	if (!Number.isFinite(minX)) return null;
	const padding = 50;
	return {
		x: minX - padding,
		y: minY - padding,
		w: maxX - minX + padding * 2,
		h: maxY - minY + padding * 2,
	};
}

async function renderPreview(
	request: PreviewStart,
	sources: any[],
): Promise<Blob | null> {
	if (sources.length === 0) return null;

	await loadFonts();
	let objects: any[] | null = null;
	let bounds = request.bounds;
	if (bounds) {
		const padding = 50;
		bounds = {
			x: bounds.x - padding,
			y: bounds.y - padding,
			w: bounds.w + padding * 2,
			h: bounds.h + padding * 2,
		};
	} else {
		const enlivened = await enlivenSources(sources);
		objects = enlivened;
		await waitForImages(objects);
		bounds = drawingBounds(objects);
	}
	if (!bounds || bounds.w <= 0 || bounds.h <= 0) return null;

	const scale = request.maxSize / Math.max(bounds.w, bounds.h);
	const width = Math.max(1, Math.round(bounds.w * scale));
	const height = Math.max(1, Math.round(bounds.h * scale));
	const canvas = new OffscreenCanvas(width, height);
	const context = canvas.getContext("2d", { alpha: true });
	if (!context) return null;

	const background = request.background;
	if (background && background !== "transparent") {
		context.fillStyle = background;
		context.fillRect(0, 0, width, height);
	}
	context.setTransform(
		scale,
		0,
		0,
		scale,
		-bounds.x * scale,
		-bounds.y * scale,
	);

	const renderObjects = async (batch: any[]) => {
		await waitForImages(batch);
		for (const object of batch) {
			const visible = object.visible;
			const caching = object.objectCaching;
			object.visible = true;
			object.objectCaching = false;
			object.dirty = true;
			context.save();
			try {
				object.render(context as any);
			} catch {
				// One unsupported object should not discard the entire draft preview.
			} finally {
				context.restore();
				object.visible = visible;
				object.objectCaching = caching;
			}
		}
	};

	if (objects) {
		await renderObjects(objects);
	} else {
		const BATCH_SIZE = 32;
		for (let index = 0; index < sources.length; index += BATCH_SIZE) {
			await renderObjects(
				await enlivenSources(sources.slice(index, index + BATCH_SIZE)),
			);
		}
	}

	return canvas.convertToBlob({
		type: "image/webp",
		quality: request.quality,
	});
}

async function enlivenSources(sources: any[]): Promise<any[]> {
	const settled = await Promise.allSettled(
		sources.map(async (source) => {
			const [object] = await util.enlivenObjects([source]);
			return object;
		}),
	);
	return settled.flatMap((result) =>
		result.status === "fulfilled" && result.value ? [result.value] : [],
	);
}

let request: PreviewStart | null = null;
const sources: any[] = [];

self.onmessage = async (event: MessageEvent<PreviewMessage>) => {
	if (event.data.type === "start") {
		request = event.data;
		sources.length = 0;
		return;
	}
	if (event.data.type === "append") {
		sources.push(...event.data.objects);
		return;
	}
	if (!request) {
		self.postMessage({ error: "Preview render started without metadata" });
		return;
	}
	try {
		const jsonBlob = new Blob(
			[
				JSON.stringify({
					...request.document,
					objects: sources,
				}),
			],
			{ type: "application/json" },
		);
		const blob = await renderPreview(request, sources);
		self.postMessage({ blob, jsonBlob });
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : "Preview worker failed",
		});
	}
};
