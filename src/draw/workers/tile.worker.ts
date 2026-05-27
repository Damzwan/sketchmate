import { util, StaticCanvas, classRegistry } from "fabric";
import { OptimizedEraserStroke } from "@/draw/utils/brushes/CustomEraserBrush";
import { PixelStroke } from "@/draw/utils/brushes/PixelBrush";
import { CharcoalStroke } from "@/draw/utils/brushes/CharcoalBrush";
import { WaterColorStroke } from "@/draw/utils/brushes/WaterColorBrush";
import { CalligraphyStroke } from "@/draw/utils/brushes/CalligraphyBrush";
import { BucketFillPath } from "@/draw/utils/BucketFillPath";
import { OptimizedPencilStroke } from "@/draw/utils/brushes/CustomPencilBrush";
import { CircleStroke } from "@/draw/utils/brushes/CustomCircleBrush";

const brushes = [
	[OptimizedEraserStroke, "OptimizedEraserStroke"],
	[PixelStroke, "PixelStroke"],
	[CharcoalStroke, "CharcoalStroke"],
	[WaterColorStroke, "WaterColorStroke"],
	[CalligraphyStroke, "CalligraphyStroke"],
	[BucketFillPath, "BucketFillPath"],
	[OptimizedPencilStroke, "OptimizedPencilStroke"],
] as const;
brushes.forEach(([cls, name]) => classRegistry.setClass(cls, name));
classRegistry.setClass(CircleStroke, CircleStroke.type);

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

if (typeof document === "undefined") {
	(globalThis as any).document = {
		createElement: (tag: string) => {
			if (tag === "canvas") {
				const mockCanvas = new OffscreenCanvas(1, 1);
				return applyCanvasDisguise(mockCanvas);
			}
			if (tag === "img") {
				const img = {
					style: {},
					onload: null as any,
					onerror: null as any,
					_src: "",
					_bitmap: null as ImageBitmap | null,
					get nodeName() {
						return "IMG";
					},
					set ["src"](value: string) {
						this._src = value;
						fetch(value)
							.then((res) => res.blob())
							.then((blob) => createImageBitmap(blob))
							.then((bitmap) => {
								this._bitmap = bitmap;
								(this as any).width = bitmap.width;
								(this as any).height = bitmap.height;
								(this as any).complete = true;
								if (this.onload) this.onload();
							})
							.catch((err) => {
								if (this.onerror) this.onerror(err);
							});
					},
					get ["src"]() {
						return this._src;
					},
					width: 0,
					height: 0,
					nodeType: 1,
					parentNode: null,
					ownerDocument: (globalThis as any).document,
					addEventListener: () => {},
					removeEventListener: () => {},
					getAttribute: (name: string) =>
						name === "src" ? (img as any)._src : null,
					hasAttribute: () => false,
					setAttribute: () => {},
					classList: { add: () => {}, remove: () => {} },
				};
				return img;
			}
			throw new Error(`Worker mock document cannot create ${tag}`);
		},
	};
	(globalThis as any).window = globalThis;
}

// Stateful Object Dictionary
const liveObjects = new Map<string, any>();
const renderCanvas = new OffscreenCanvas(1, 1);
const ctx = renderCanvas.getContext("2d", {
	alpha: true,
}) as OffscreenCanvasRenderingContext2D;

async function processObjectUpsert(id: string, payload: any) {
	const [enlivened] = await util.enlivenObjects([payload]);

	if (enlivened.type === "image" && enlivened._element) {
		const imgMock = enlivened._element;
		if (!imgMock._bitmap) {
			await new Promise((resolve) => {
				const ogOnload = imgMock.onload;
				imgMock.onload = () => {
					if (ogOnload) ogOnload();
					resolve(true);
				};
				setTimeout(() => resolve(false), 5000);
			});
		}
		enlivened._element = imgMock._bitmap;
	}

	liveObjects.set(id, enlivened);
}

self.onmessage = async (e: MessageEvent) => {
	const { type, msgId } = e.data;

	try {
		if (type === "upsert") {
			await processObjectUpsert(e.data.id, e.data.payload);
			self.postMessage({ msgId, success: true });
		} else if (type === "batch-upsert") {
			await Promise.all(
				e.data.items.map((item: any) =>
					processObjectUpsert(item.id, item.payload),
				),
			);
			self.postMessage({ msgId, success: true });
		} else if (type === "remove") {
			liveObjects.delete(e.data.id);
		} else if (type === "clear") {
			liveObjects.clear();
		} else if (type === "bake" || type === "additive") {
			const { objIds, scale, world, overscan, bitmapSize, existingBitmap } =
				e.data;

			renderCanvas.width = bitmapSize;
			renderCanvas.height = bitmapSize;
			ctx.setTransform(1, 0, 0, 1, 0, 0);
			ctx.clearRect(0, 0, bitmapSize, bitmapSize);

			// If additive patch, draw the existing bitmap first
			if (type === "additive" && existingBitmap) {
				ctx.drawImage(existingBitmap, 0, 0);
				existingBitmap.close(); // Prevent memory leak
			}

			ctx.save();
			ctx.translate(overscan, overscan);
			ctx.scale(scale, scale);
			ctx.translate(-world.x, -world.y);

			const totalPad = overscan / scale + 4 / scale;
			ctx.beginPath();
			ctx.rect(
				world.x - totalPad,
				world.y - totalPad,
				world.w + 2 * totalPad,
				world.h + 2 * totalPad,
			);
			ctx.clip();

			for (const id of objIds) {
				const obj = liveObjects.get(id);
				if (!obj || obj.visible === false || obj.opacity === 0) continue;

				const originalCanvas = obj.canvas;
				obj.canvas = null;
				obj.objectCaching = false;
				obj.dirty = true;
				if (obj.clipPath) obj.clipPath.dirty = true;

				ctx.save();
				try {
					obj.render(ctx as any);
				} catch (err) {
				} finally {
					ctx.restore();
					obj.canvas = originalCanvas;
				}
			}

			ctx.restore();
			const newBitmap = renderCanvas.transferToImageBitmap();

			// Transfer ownership of the bitmap back to the main thread
			self.postMessage({ msgId, bitmap: newBitmap }, [newBitmap]);
		}
	} catch (error: any) {
		self.postMessage({ msgId, error: error.message });
	}
};
