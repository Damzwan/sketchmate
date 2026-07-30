import { util, StaticCanvas, classRegistry } from "fabric";
import { OptimizedEraserStroke } from "@/draw/utils/brushes/CustomEraserBrush";
import { OptimizedPencilStroke } from "@/draw/utils/brushes/CustomPencilBrush";

// --- THE DISGUISE FUNCTION ---
// Equips an OffscreenCanvas with fake DOM methods so Fabric doesn't crash
const applyCanvasDisguise = (canvas: any) => {
	canvas.hasAttribute = () => false;
	canvas.getAttribute = () => null;
	canvas.setAttribute = () => {};
	canvas.removeAttribute = () => {};
	canvas.style = {};

	// The missing piece: fake classList
	canvas.classList = {
		add: () => {},
		remove: () => {},
		contains: () => false,
		toggle: () => {},
	};

	// Just in case it tries to bind events or read text direction
	canvas.addEventListener = () => {};
	canvas.removeEventListener = () => {};
	canvas.dir = "ltr";

	return canvas;
};

// 1. THE MOCK DOM (Catches internal scratch canvases Fabric might try to create)
// 1. THE MOCK DOM - Now with Image support
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

					// Fabric v7 internal check helper
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

								// Fabric uses the 'complete' property to check status
								(this as any).complete = true;

								if (this.onload) this.onload();
							})
							.catch((err) => {
								console.error("Worker Image Load Error:", err);
								if (this.onerror) this.onerror(err);
							});
					},
					get ["src"]() {
						return this._src;
					},

					// CRITICAL: When Fabric calls drawImage, it usually passes its internal '_element'.
					// We need to trick the proxying if Fabric tries to read this object.
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
					classList: {
						add: () => {},
						remove: () => {},
					},
				};
				return img;
			}
			throw new Error(`Worker mock document cannot create ${tag}`);
		},
	};
	(globalThis as any).window = globalThis;
}

self.onmessage = async (e: MessageEvent) => {
	const { objects, width, height, backgroundColor, scale } = e.data;

	try {
		let offscreen = new OffscreenCanvas(width * scale, height * scale) as any;
		offscreen = applyCanvasDisguise(offscreen);

		const fabricCanvas = new StaticCanvas(offscreen);
		fabricCanvas.backgroundColor = backgroundColor;

		classRegistry.setClass(OptimizedEraserStroke, "OptimizedEraserStroke");
		classRegistry.setClass(OptimizedPencilStroke, "OptimizedPencilStroke");

		// 1. Enliven the objects
		const enlivenedObjects = await util.enlivenObjects(objects);

		// 2. THE ASYNC BARRIER: Wait for all images to actually have bitmaps
		const imageWaiters = enlivenedObjects
			.filter((obj: any) => obj.type === "image" && obj._element)
			.map((obj: any) => {
				return new Promise((resolve) => {
					const imgMock = obj._element;
					// If already loaded, resolve immediately
					if (imgMock._bitmap) return resolve(true);

					// Otherwise, hook into the onload we defined in the mock
					const originalOnload = imgMock.onload;
					imgMock.onload = () => {
						if (originalOnload) originalOnload();
						resolve(true);
					};
					// Safety timeout: don't hang the worker forever if an image 404s
					setTimeout(() => resolve(false), 5000);
				});
			});

		await Promise.all(imageWaiters);

		// 3. THE SWAP: Now that we KNOW bitmaps exist, swap them
		enlivenedObjects.forEach((obj: any) => {
			if (obj.type === "image" && obj._element && obj._element._bitmap) {
				// Swap the mock object for the actual native ImageBitmap
				obj._element = obj._element._bitmap;
			}
		});

		// 4. Render
		// @ts-ignore
		fabricCanvas.add(...enlivenedObjects);
		fabricCanvas.setZoom(scale);
		fabricCanvas.renderAll();

		// 5. Export
		const blob = await offscreen.convertToBlob({
			type: "image/webp",
			quality: 0.8,
		});
		self.postMessage({ blob });
	} catch (error: any) {
		console.error("Worker Render Error:", error);
		self.postMessage({ error: error.message || "Worker crash" });
	}
};
