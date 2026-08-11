import * as fabric from "fabric";
import { BaseBrush, type Canvas, FabricImage, Point } from "fabric";

export class NeonBrush extends BaseBrush {
	protected declare _points: Point[];

	constructor(canvas: Canvas) {
		super(canvas);
		this.canvas = canvas;
		this._points = [];
	}

	onMouseDown(pointer: Point) {
		this._points = [];
		this._addPoint(pointer);
		this._render();
	}

	onMouseMove(pointer: Point) {
		if (this._addPoint(pointer) && this._points.length > 1) {
			this.canvas.clearContext(this.canvas.contextTop);
			this._render();
		}
	}

	onMouseUp() {
		const originalRenderOnAddRemove = this.canvas.renderOnAddRemove;
		this.canvas.renderOnAddRemove = false;

		if (this._points.length > 0) {
			const img = generateNeonImage(
				this._points,
				this.width,
				this.color as string,
			);
			if (img) {
				const stroke = new NeonStroke(img.getElement(), {
					...img.toObject(),
					color: this.color,
					baseWidth: this.width,
					neonPoints: [...this._points],
				});
				this.canvas.fire("before:path:created", { path: stroke });
				this.canvas.add(stroke);
				this.canvas.fire("path:created", { path: stroke });
			}
		}

		this.canvas.clearContext(this.canvas.contextTop);
		this.canvas.renderOnAddRemove = originalRenderOnAddRemove;
		this._points = [];
		return false;
	}

	_render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
		if (!this._points.length) return;
		this._saveAndTransform(ctx);

		const vpt = this.canvas.viewportTransform;
		const zoom = vpt ? vpt[0] : 1;
		const coreWidth = Math.max(2, this.width * 0.3);

		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		// 1. Glow Pass
		ctx.strokeStyle = "#ffffff";
		ctx.lineWidth = coreWidth;
		ctx.shadowColor = this.color as string;
		ctx.shadowBlur = this.width * 1.5 * zoom;
		ctx.globalAlpha = 0.9;

		ctx.beginPath();
		let p1 = this._points[0];
		ctx.moveTo(p1.x, p1.y);
		for (let i = 1; i < this._points.length; i++) {
			const p2 = this._points[i];
			const mid = p1.midPointFrom(p2);
			ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
			p1 = p2;
		}
		ctx.lineTo(p1.x, p1.y);
		ctx.stroke();

		// 2. Crisp Core Pass
		ctx.shadowBlur = 0;
		ctx.shadowColor = "transparent";
		ctx.globalAlpha = 1.0;
		ctx.stroke();

		ctx.restore();
	}

	private _addPoint(point: Point) {
		if (
			this._points.length > 0 &&
			point.eq(this._points[this._points.length - 1])
		)
			return false;
		this._points.push(point);
		return true;
	}
}

import {
	enlivenStrokeProps,
	TEXTURE_SUPERSAMPLE,
} from "@/draw/utils/brushes/brush.helpers";

// Pure renderer: (points, width, color) → glow bitmap wrapped as FabricImage.
// Deterministic, so the bitmap can be dropped from the payload and rebuilt.
export function generateNeonImage(
	points: Point[],
	width: number,
	color: string,
): FabricImage | null {
	if (points.length === 0) return null;
	const coreWidth = Math.max(2, width * 0.3);
	const blur = width * 1.5;
	const margin = blur + coreWidth;

	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	minX -= margin;
	minY -= margin;
	maxX += margin;
	maxY += margin;

	const w = Math.ceil(maxX - minX);
	const h = Math.ceil(maxY - minY);
	if (w <= 0 || h <= 0) return null;

	// Device-independent — see TEXTURE_SUPERSAMPLE.
	const dpr = TEXTURE_SUPERSAMPLE;

	const off = document.createElement("canvas");
	off.width = Math.ceil(w * dpr);
	off.height = Math.ceil(h * dpr);
	const ctx = off.getContext("2d");
	if (!ctx) return null;
	ctx.scale(dpr, dpr);

	ctx.strokeStyle = "#ffffff";
	ctx.lineWidth = coreWidth;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";
	ctx.shadowColor = color;
	ctx.shadowBlur = blur;
	ctx.globalAlpha = 0.9;

	ctx.beginPath();
	let p1 = points[0];
	ctx.moveTo(p1.x - minX, p1.y - minY);
	for (let i = 1; i < points.length; i++) {
		const p2 = points[i];
		const mid = p1.midPointFrom(p2);
		ctx.quadraticCurveTo(p1.x - minX, p1.y - minY, mid.x - minX, mid.y - minY);
		p1 = p2;
	}
	ctx.lineTo(p1.x - minX, p1.y - minY);
	ctx.stroke();

	ctx.shadowBlur = 0;
	ctx.shadowColor = "transparent";
	ctx.globalAlpha = 1.0;
	ctx.stroke();

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

export class NeonStroke extends FabricImage {
	static override type = "NeonStroke";
	static override cacheProperties = [
		...FabricImage.cacheProperties,
		"color",
		"baseWidth",
		"compressedTrace",
	];

	public neonPoints: Point[] = [];
	public color: string = "#ffffff";
	public baseWidth: number = 20;

	constructor(element: any, options: any) {
		super(element, options);
		this.color = options.color;
		this.baseWidth = options.baseWidth;
		if (options.compressedTrace) {
			this.neonPoints = this._inflate(options.compressedTrace);
		} else {
			this.neonPoints = options.neonPoints || [];
		}
	}

	private _inflate(c: number[]): Point[] {
		const out: Point[] = [];
		let lastX = 0,
			lastY = 0;
		for (let i = 0; i < c.length; i += 2) {
			let ix = c[i],
				iy = c[i + 1];
			if (i > 0) {
				ix += lastX;
				iy += lastY;
			}
			lastX = ix;
			lastY = iy;
			out.push(new Point(ix / 10, iy / 10));
		}
		return out;
	}

	// @ts-expect-error
	toObject(additionalProperties: string[] = []) {
		// Delta-encoded, integer-scaled points — same scheme as your other strokes.
		const flat: number[] = [];
		let lastX = 0,
			lastY = 0;
		for (let i = 0; i < this.neonPoints.length; i++) {
			const p = this.neonPoints[i];
			const ix = Math.round(p.x * 10),
				iy = Math.round(p.y * 10);
			if (i === 0) flat.push(ix, iy);
			else flat.push(ix - lastX, iy - lastY);
			lastX = ix;
			lastY = iy;
		}
		const baseObj = super.toObject([
			"color",
			"baseWidth",
			...additionalProperties,
		] as any);
		// CRITICAL: drop the rasterized bitmap — this is the whole payload win.
		delete (baseObj as any).src;
		return { ...baseObj, compressedTrace: flat };
	}

	static override async fromObject(object: any) {
		// Pixels supplied by the tile worker (transferred ImageBitmap). Use them
		// directly instead of re-running the generator on every enliven — that
		// regeneration is why these strokes were refused off-thread.
		if (object.__workerBitmap) {
			const props = await enlivenStrokeProps(object);
			return new NeonStroke(object.__workerBitmap, props);
		}
		if (!object.src) {
			// Rebuild points, regenerate the glow bitmap deterministically.
			const pts: Point[] = [];
			let lastX = 0,
				lastY = 0;
			const c = object.compressedTrace || [];
			for (let i = 0; i < c.length; i += 2) {
				let ix = c[i],
					iy = c[i + 1];
				if (i > 0) {
					ix += lastX;
					iy += lastY;
				}
				lastX = ix;
				lastY = iy;
				pts.push(new Point(ix / 10, iy / 10));
			}
			const img = generateNeonImage(pts, object.baseWidth, object.color);
			if (img) {
				const props = await enlivenStrokeProps(object);
				return new NeonStroke(img.getElement(), { ...props, neonPoints: pts });
			}
		}
		return fabric.util.enlivenObjects([object]).then((e) => e[0]);
	}
}
