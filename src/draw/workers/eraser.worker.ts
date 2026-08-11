import { ClippingGroup } from "@erase2d/fabric";
import { classRegistry, util } from "fabric";
import {
	type AlphaCoverage,
	confirmsEffectiveErasure,
	MAX_RESIDUAL_ALPHA,
	measureAlphaCoverage,
	preciseErasureMultiplier,
} from "@/draw/tools/erasureAnalysisPolicy";
import { registerBrushClasses } from "@/draw/utils/brushes/registry";

const COARSE_PIXEL_BUDGET = 262_144;

function boundedMultiplier(
	width: number,
	height: number,
	requested: number,
): number {
	const area = width * height * requested * requested;
	if (!Number.isFinite(area) || area <= 0 || area <= COARSE_PIXEL_BUDGET) {
		return requested;
	}
	return requested * Math.sqrt(COARSE_PIXEL_BUDGET / area);
}

function renderAlphaCoverage(
	obj: any,
	multiplier: number,
): AlphaCoverage | null {
	const canvas: any = obj.toCanvasElement({ multiplier });
	if (!canvas?.width || !canvas?.height) return null;

	try {
		const context = canvas.getContext("2d", { willReadFrequently: true });
		if (!context) return null;
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		return measureAlphaCoverage(pixels);
	} finally {
		canvas.width = 0;
		canvas.height = 0;
	}
}

function hasEraseLayer(clip: any): boolean {
	return !!clip?._objects?.some(
		(child: any) => child?.globalCompositeOperation === "destination-out",
	);
}

function analyzeCompleteErasure(
	obj: any,
	width: number,
	height: number,
	requestedMultiplier: number,
): boolean {
	const coarse = renderAlphaCoverage(
		obj,
		boundedMultiplier(width, height, requestedMultiplier),
	);
	if (!coarse || coarse.maxAlpha > MAX_RESIDUAL_ALPHA) return false;
	const preciseMultiplier = preciseErasureMultiplier(width, height);
	if (!preciseMultiplier) return false;

	const precise = renderAlphaCoverage(obj, preciseMultiplier);
	if (!precise || precise.maxAlpha > MAX_RESIDUAL_ALPHA) return false;

	const clip = obj.clipPath as any;
	if (!hasEraseLayer(clip)) return false;

	const previousBlockErasing = clip.blockErasing;
	try {
		clip.blockErasing = true;
		clip.set?.("dirty", true);
		obj.set?.("dirty", true);
		const unerased = renderAlphaCoverage(obj, preciseMultiplier);
		return confirmsEffectiveErasure(precise, unerased);
	} finally {
		clip.blockErasing = previousBlockErasing;
		clip.set?.("dirty", true);
		obj.set?.("dirty", true);
	}
}

// --- MOCK DOM & DISGUISE (Copied from your stable Preview Worker) ---
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
	const { reqId, object, width, height, multiplier } = e.data;

	try {
		registerBrushClasses();
		classRegistry.setClass(ClippingGroup as any);

		const enlivened = await util.enlivenObjects([object]);
		const obj: any = enlivened[0];

		// Image barrier — recurse into groups/active-selections so NESTED images
		// are handled too (the old top-level-only filter left group-child images
		// as the mock element → drawImage threw "not of type ...").
		const collectImages = (o: any, out: any[] = []): any[] => {
			if (!o) return out;
			if (o.type === "image" && o._element) out.push(o);
			const kids =
				o._objects ||
				(typeof o.getObjects === "function" ? o.getObjects() : null);
			if (Array.isArray(kids)) for (const k of kids) collectImages(k, out);
			return out;
		};
		const images = collectImages(obj);

		await Promise.all(
			images.map(
				(o: any) =>
					new Promise((resolve) => {
						const m = o._element;
						if (m?._bitmap) return resolve(true);
						const prev = m?.onload;
						if (m)
							m.onload = () => {
								if (prev) prev();
								resolve(true);
							};
						setTimeout(() => resolve(false), 5000);
					}),
			),
		);

		let missingBitmap = false;
		for (const o of images) {
			if (o._element?._bitmap) o._element = o._element._bitmap;
			else missingBitmap = true;
		}
		// Can't rasterize an image whose bitmap never arrived, so keep the object.
		if (missingBitmap) {
			return self.postMessage({ reqId, fullyErased: false });
		}

		self.postMessage({
			reqId,
			fullyErased: analyzeCompleteErasure(
				obj,
				Number(width),
				Number(height),
				Number(multiplier) || 0.5,
			),
		});
	} catch (err: any) {
		self.postMessage({ reqId, error: err.message });
	}
};
