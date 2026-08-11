import * as fabric from "fabric";
import {
	BaseBrush,
	type Canvas,
	FabricImage,
	type Point,
	type SprayBrushPoint,
} from "fabric";

export class FastSprayBrush extends BaseBrush {
	/** Width of a spray */
	override width = 10;

	/** Density of a spray (number of dots per chunk) */
	density = 20;

	/** Fixed width of spray dots. (Variance removed for max compression) */
	dotWidth = 1;

	private declare sprayDots: SprayBrushPoint[];
	private declare latestChunkStart: number;

	constructor(canvas: Canvas) {
		super(canvas);
		this.sprayDots = [];
		this.latestChunkStart = 0;
	}

	onMouseDown(pointer: Point) {
		this.sprayDots = [];
		this.latestChunkStart = 0;
		this.canvas.clearContext(this.canvas.contextTop);
		this._setShadow();

		this.addSprayChunk(pointer);
		this.renderChunk();
	}

	onMouseMove(pointer: Point) {
		if (this.limitedToCanvasSize === true && this._isOutSideCanvas(pointer)) {
			return;
		}
		this.addSprayChunk(pointer);
		this.renderChunk();
	}

	onMouseUp() {
		const originalRenderOnAddRemove = this.canvas.renderOnAddRemove;
		this.canvas.renderOnAddRemove = false;

		if (this.sprayDots.length > 0) {
			const img = generateSprayImage(
				this.sprayDots,
				this.color as string,
				this.dotWidth,
			);
			if (img) {
				const stroke = new SprayStroke(img.getElement(), {
					...img.toObject(),
					color: this.color,
					dotWidth: this.dotWidth,
					dots: [...this.sprayDots],
				});
				this.canvas.fire("before:path:created", { path: stroke });
				this.canvas.add(stroke);
				this.canvas.fire("path:created", { path: stroke });
			}
		}

		this.canvas.clearContext(this.canvas.contextTop);
		this._resetShadow();
		this.canvas.renderOnAddRemove = originalRenderOnAddRemove;
		this.sprayDots = [];
	}

	renderChunk() {
		const ctx = this.canvas.contextTop;
		ctx.fillStyle = this.color;

		this._saveAndTransform(ctx);

		// Live preview uses basic fillRect for max drawing speed while mouse is down
		for (let i = this.latestChunkStart; i < this.sprayDots.length; i++) {
			const point = this.sprayDots[i];
			ctx.fillRect(point.x, point.y, this.dotWidth, this.dotWidth);
		}

		ctx.restore();
		this.latestChunkStart = this.sprayDots.length;
	}

	_render() {
		const ctx = this.canvas.contextTop;
		ctx.fillStyle = this.color;

		this._saveAndTransform(ctx);

		for (let i = 0; i < this.sprayDots.length; i++) {
			const point = this.sprayDots[i];
			ctx.fillRect(point.x, point.y, this.dotWidth, this.dotWidth);
		}
		ctx.restore();
	}

	addSprayChunk(pointer: Point) {
		const radius = this.width / 2;

		for (let i = 0; i < this.density; i++) {
			this.sprayDots.push({
				x: fabric.util.getRandomInt(pointer.x - radius, pointer.x + radius),
				y: fabric.util.getRandomInt(pointer.y - radius, pointer.y + radius),
				width: this.dotWidth,
				opacity: 1,
			});
		}
	}
}

import {
	enlivenStrokeProps,
	TEXTURE_SUPERSAMPLE,
} from "@/draw/utils/brushes/brush.helpers";

// Pure renderer: (dots, color, dpr) → spray bitmap. Deterministic given the
// stored dot list, so the bitmap is regenerable and need not be serialized.
export function generateSprayImage(
	dots: SprayBrushPoint[],
	color: string,
	dotWidth: number,
): FabricImage | null {
	if (dots.length === 0) return null;

	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const d of dots) {
		const w = d.width || dotWidth;
		if (d.x < minX) minX = d.x;
		if (d.y < minY) minY = d.y;
		if (d.x + w > maxX) maxX = d.x + w;
		if (d.y + w > maxY) maxY = d.y + w;
	}
	const pad = dotWidth;
	minX -= pad;
	minY -= pad;
	maxX += pad;
	maxY += pad;

	const w = maxX - minX,
		h = maxY - minY;
	if (w <= 0 || h <= 0) return null;

	// Device-independent — see TEXTURE_SUPERSAMPLE. (Also fixes NaN dimensions:
	// the old expression had no `|| 1`, so off-main it read undefined.)
	const dpr = TEXTURE_SUPERSAMPLE;

	const off = document.createElement("canvas");
	off.width = w * dpr;
	off.height = h * dpr;
	const ctx = off.getContext("2d");
	if (!ctx) return null;
	ctx.scale(dpr, dpr);
	ctx.fillStyle = color;

	for (let i = 0; i < dots.length; i++) {
		const d = dots[i];
		const dw = d.width || dotWidth;
		ctx.globalAlpha = d.opacity ?? 1;
		ctx.fillRect(d.x - minX, d.y - minY, dw, dw);
	}

	return new FabricImage(off, {
		left: minX + w / 2,
		top: minY + h / 2,
		originX: "center",
		originY: "center",
		scaleX: 1 / dpr,
		scaleY: 1 / dpr,
		objectCaching: false,
		interactive: false,
	});
}

export class SprayStroke extends FabricImage {
	static override type = "SprayStroke";
	static override cacheProperties = [
		...FabricImage.cacheProperties,
		"color",
		"dotWidth",
		"compressedDots",
	];

	public dots: SprayBrushPoint[] = [];
	public color: string = "#000000";
	public dotWidth: number = 1;

	constructor(element: any, options: any) {
		super(element, options);
		this.color = options.color;
		this.dotWidth = options.dotWidth ?? 1;
		if (options.compressedDots) {
			this.dots = this._inflate(options.compressedDots);
		} else {
			this.dots = options.dots || [];
		}
	}

	private _inflate(c: number[]): SprayBrushPoint[] {
		const out: SprayBrushPoint[] = [];
		let lastX = 0,
			lastY = 0;
		// pairs of delta-encoded ints; opacity assumed 1 (variance removed per your note)
		for (let i = 0; i < c.length; i += 2) {
			let ix = c[i],
				iy = c[i + 1];
			if (i > 0) {
				ix += lastX;
				iy += lastY;
			}
			lastX = ix;
			lastY = iy;
			out.push({
				x: ix,
				y: iy,
				width: this.dotWidth,
				opacity: 1,
			} as SprayBrushPoint);
		}
		return out;
	}

	// @ts-expect-error
	toObject(additionalProperties: string[] = []) {
		const flat: number[] = [];
		let lastX = 0,
			lastY = 0;
		for (let i = 0; i < this.dots.length; i++) {
			const d = this.dots[i];
			const ix = Math.round(d.x),
				iy = Math.round(d.y);
			if (i === 0) flat.push(ix, iy);
			else flat.push(ix - lastX, iy - lastY);
			lastX = ix;
			lastY = iy;
		}
		const baseObj = super.toObject([
			"color",
			"dotWidth",
			...additionalProperties,
		] as any);
		delete (baseObj as any).src; // drop the bitmap — the payload win
		return { ...baseObj, compressedDots: flat };
	}

	static override async fromObject(object: any) {
		// Pixels supplied by the tile worker (transferred ImageBitmap). Use them
		// directly instead of re-running the generator on every enliven — that
		// regeneration is why these strokes were refused off-thread.
		if (object.__workerBitmap) {
			const props = await enlivenStrokeProps(object);
			return new SprayStroke(object.__workerBitmap, props);
		}
		if (!object.src) {
			const dots: SprayBrushPoint[] = [];
			let lastX = 0,
				lastY = 0;
			const c = object.compressedDots || [];
			const dw = object.dotWidth ?? 1;
			for (let i = 0; i < c.length; i += 2) {
				let ix = c[i],
					iy = c[i + 1];
				if (i > 0) {
					ix += lastX;
					iy += lastY;
				}
				lastX = ix;
				lastY = iy;
				dots.push({ x: ix, y: iy, width: dw, opacity: 1 } as SprayBrushPoint);
			}
			const img = generateSprayImage(dots, object.color, dw);
			if (img) {
				const props = await enlivenStrokeProps(object);
				return new SprayStroke(img.getElement(), { ...props, dots });
			}
		}
		return fabric.util.enlivenObjects([object]).then((e) => e[0]);
	}
}
