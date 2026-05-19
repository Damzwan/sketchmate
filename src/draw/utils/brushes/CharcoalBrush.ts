import { BaseBrush, Point, Canvas, FabricObject } from "fabric";
import * as fabric from "fabric";
import { enlivenStrokeProps } from "@/draw/utils/brushes/brush.helpers";

export class CharcoalBrush extends BaseBrush {
	private _trace: CharcoalPoint[] = [];
	private _stampCanvas!: HTMLCanvasElement;
	private _stampSize: number = 0;
	private _lastPoint?: Point;

	private _drawnDistance: number = 0;
	public maxDistance: number = 600;

	constructor(canvas: Canvas) {
		super(canvas);
	}

	// TREATMENT 1: Core Density Injection
	private _generateStamp() {
		this._stampSize = this.width * 2;
		const canvas = document.createElement("canvas");
		canvas.width = canvas.height = this._stampSize;
		const ctx = canvas.getContext("2d")!;

		// A. Lay down a soft, semi-transparent core tissue to give the stroke weight
		ctx.beginPath();
		ctx.arc(
			this._stampSize / 2,
			this._stampSize / 2,
			this.width / 2.5,
			0,
			Math.PI * 2,
		);
		ctx.fillStyle = this.color;
		ctx.globalAlpha = 0.15;
		ctx.fill();

		// B. Generate the harsh grain using a center-weighted distribution
		// This clusters the heaviest flakes near the center, simulating physical pressure
		for (let i = 0; i < this.width * 20; i++) {
			const radius = Math.random() * Math.random() * (this.width / 1.2);
			const angle = Math.random() * Math.PI * 2;
			const x = this._stampSize / 2 + Math.cos(angle) * radius;
			const y = this._stampSize / 2 + Math.sin(angle) * radius;

			ctx.globalAlpha = Math.random() * 0.8 + 0.2;
			const grainSize = Math.random() * 1.5 + 0.5;
			ctx.fillRect(x, y, grainSize, grainSize);
		}
		this._stampCanvas = canvas;
	}

	onMouseDown(pointer: Point) {
		this._trace = [];
		this._drawnDistance = 0;
		this._generateStamp();
		this._lastPoint = pointer;
		this._addPoint(pointer, true);
	}

	onMouseMove(pointer: Point) {
		if (this._addPoint(pointer)) {
			this.canvas.clearContext(this.canvas.contextTop);
			this._render();
		}
	}

	onMouseUp() {
		if (this._trace.length > 0) {
			const stroke = new CharcoalStroke({
				trace: [...this._trace],
				stampCanvas: this._stampCanvas,
				stampSize: this._stampSize,
				fill: this.color,
				stampDataUrl: this._stampCanvas.toDataURL(),
			});

			this.canvas.add(stroke);
			this.canvas.clearContext(this.canvas.contextTop);
			this.canvas.fire("path:created", { path: stroke });
			this.canvas?.requestRenderAll();
		}

		this._lastPoint = undefined;
		return false;
	}

	// TREATMENT 2: Sustained Frictional Fade
	private _addPoint(pointer: Point, isFirstPoint = false) {
		if (isFirstPoint) {
			this._trace.push({
				x: pointer.x,
				y: pointer.y,
				opacity: 1,
				offsetX: 0,
				offsetY: 0,
			});
			return true;
		}

		if (!this._lastPoint) return false;

		const distance = this._lastPoint.distanceFrom(pointer);
		const spacing = Math.max(1, this.width / 5);

		if (distance < spacing) return false;

		const steps = Math.floor(distance / spacing);
		let pointsAdded = false;

		for (let i = 1; i <= steps; i++) {
			this._drawnDistance += spacing;

			// Calculate how depleted the charcoal is (0 = fresh, 1 = max distance reached)
			const depletion = Math.min(1, this._drawnDistance / this.maxDistance);

			// The stroke tapers down to a 20% opacity baseline, it never completely dies
			const fadeRatio = 1 - depletion * 0.8;

			const t = i / steps;
			const x = this._lastPoint.x + (pointer.x - this._lastPoint.x) * t;
			const y = this._lastPoint.y + (pointer.y - this._lastPoint.y) * t;

			// As the charcoal runs dry (depletion increases), it skips across the paper's tooth more erratically
			const dryFrictionMultiplier = 1 + depletion * 2.5;
			const jitter = (this.width / 6) * dryFrictionMultiplier;

			const offsetX = (Math.random() - 0.5) * jitter;
			const offsetY = (Math.random() - 0.5) * jitter;

			this._trace.push({ x, y, opacity: fadeRatio, offsetX, offsetY });
			pointsAdded = true;
		}

		this._lastPoint = pointer;
		return pointsAdded;
	}

	_render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
		ctx.save();
		const vpt = this.canvas.viewportTransform;
		if (vpt) {
			ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
		}

		const radius = this._stampSize / 2;

		for (const p of this._trace) {
			ctx.globalAlpha = p.opacity;
			ctx.drawImage(
				this._stampCanvas,
				p.x + p.offsetX - radius,
				p.y + p.offsetY - radius,
			);
		}

		ctx.restore();
	}
}

interface CharcoalPoint {
	x: number;
	y: number;
	opacity: number;
	offsetX: number;
	offsetY: number;
}

export class CharcoalStroke extends FabricObject {
	static type = "CharcoalStroke";

	static cacheProperties = [
		...FabricObject.cacheProperties,
		"trace",
		"stampSize",
		"stampDataUrl",
		"minX",
		"minY",
	];

	public trace: any[];
	public stampCanvas?: HTMLCanvasElement;
	public stampSize: number;
	public stampDataUrl?: string;
	public minX: number = 0;
	public minY: number = 0;

	constructor(options: any) {
		super(options);

		if (options.compressedTrace && Array.isArray(options.compressedTrace)) {
			this.trace = [];
			let lastX = 0;
			let lastY = 0;

			for (let i = 0; i < options.compressedTrace.length; i += 5) {
				let ix = options.compressedTrace[i];
				let iy = options.compressedTrace[i + 1];

				// Reverse the Delta Encoding
				if (i > 0) {
					ix += lastX;
					iy += lastY;
				}
				lastX = ix;
				lastY = iy;

				// Reverse the Integer Scaling (divide by 100)
				this.trace.push({
					x: ix / 100,
					y: iy / 100,
					opacity: options.compressedTrace[i + 2] / 100,
					offsetX: options.compressedTrace[i + 3] / 100,
					offsetY: options.compressedTrace[i + 4] / 100,
				});
			}
		} else {
			this.trace = options.trace || [];
		}

		this.stampSize = options.stampSize || 0;
		this.stampCanvas = options.stampCanvas;
		this.stampDataUrl = options.stampDataUrl;
		this.minX = options.minX || 0;
		this.minY = options.minY || 0;

		this.originX = "left";
		this.originY = "top";

		if (typeof options.left !== "number") {
			this._calcDimensions();
		}
	}

	private _calcDimensions() {
		if (!this.trace.length) return;

		let minX = Infinity,
			maxX = -Infinity,
			minY = Infinity,
			maxY = -Infinity;

		for (const p of this.trace) {
			const px = p.x + p.offsetX;
			const py = p.y + p.offsetY;
			if (px < minX) minX = px;
			if (px > maxX) maxX = px;
			if (py < minY) minY = py;
			if (py > maxY) maxY = py;
		}

		const radius = this.stampSize / 2;

		// Store the STATIC anchors
		this.minX = minX;
		this.minY = minY;

		this.width = maxX - minX + this.stampSize;
		this.height = maxY - minY + this.stampSize;

		// Set the initial global position
		this.left = minX - radius;
		this.top = minY - radius;
	}

	_render(ctx: CanvasRenderingContext2D) {
		if (!this.stampCanvas) return;

		const halfWidth = this.width / 2;
		const halfHeight = this.height / 2;

		// CRITICAL: Save the state so eraser settings don't bleed into stamps
		ctx.save();

		for (const p of this.trace) {
			const localX = p.x + p.offsetX - this.minX - halfWidth;
			const localY = p.y + p.offsetY - this.minY - halfHeight;

			// We set alpha per-stamp. ctx.save/restore isn't needed inside the loop
			// but we MUST ensure we don't multiply alpha if the context already has one.
			ctx.globalAlpha = p.opacity;
			ctx.drawImage(this.stampCanvas, localX, localY);
		}

		ctx.restore();
	}

	toObject(additionalProperties: string[] = []) {
		const flatTrace: number[] = [];
		let lastX = 0;
		let lastY = 0;

		for (let i = 0; i < this.trace.length; i++) {
			const p = this.trace[i];

			// 1. Integer Scaling (multiply by 100, round to whole number)
			const ix = Math.round(p.x * 100);
			const iy = Math.round(p.y * 100);
			const iOpacity = Math.round(p.opacity * 100);
			const iOffsetX = Math.round(p.offsetX * 100);
			const iOffsetY = Math.round(p.offsetY * 100);

			// 2. Delta Encoding for X and Y
			if (i === 0) {
				flatTrace.push(ix, iy, iOpacity, iOffsetX, iOffsetY);
			} else {
				flatTrace.push(ix - lastX, iy - lastY, iOpacity, iOffsetX, iOffsetY);
			}

			lastX = ix;
			lastY = iy;
		}

		const baseObject = super.toObject([
			"left",
			"top",
			"width",
			"height",
			"fill",
			"stampSize",
			"stampDataUrl",
			"minX",
			"minY",
			...additionalProperties,
		]);

		return { ...baseObject, compressedTrace: flatTrace };
	}

	static async fromObject(object: any) {
		if (object.stampDataUrl && !object.stampCanvas) {
			const img = await fabric.util.loadImage(object.stampDataUrl);
			const canvas = document.createElement("canvas");
			canvas.width = canvas.height = object.stampSize;
			canvas.getContext("2d")?.drawImage(img, 0, 0);
			object.stampCanvas = canvas;
		}
		const enlivenedProps = await enlivenStrokeProps(object);
		return new CharcoalStroke(enlivenedProps);
	}
}
