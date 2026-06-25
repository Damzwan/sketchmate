import { BaseBrush, Point, Canvas, FabricObject } from "fabric";
import * as fabric from "fabric";
import { enlivenStrokeProps } from "@/draw/utils/brushes/brush.helpers";

// --- Utility: Deterministic Generator ---
export function seededRandom(seed: number) {
	return function () {
		seed = (seed * 9301 + 49297) % 233280;
		return seed / 233280;
	};
}

export function generateCharcoalStamp(seed: number, width: number, color: string): HTMLCanvasElement {
	const rand = seededRandom(seed);
	const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
	const SS = Math.min(dpr * 2, 3);
	const stampSize = width * 2;
	const physical = Math.ceil(stampSize * SS);

	const canvas = document.createElement("canvas");
	canvas.width = canvas.height = physical;
	const ctx = canvas.getContext("2d")!;
	ctx.scale(SS, SS);

	// Soft core
	ctx.beginPath();
	ctx.arc(stampSize / 2, stampSize / 2, width / 2.5, 0, Math.PI * 2);
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.15;
	ctx.fill();

	// Grain
	const flakes = Math.floor(width * 20);
	for (let i = 0; i < flakes; i++) {
		const radius = rand() * rand() * (width / 1.2);
		const angle = rand() * Math.PI * 2;
		const x = stampSize / 2 + Math.cos(angle) * radius;
		const y = stampSize / 2 + Math.sin(angle) * radius;
		ctx.globalAlpha = rand() * 0.8 + 0.2;
		ctx.fillRect(x, y, rand() * 1.5 + 0.5, rand() * 1.5 + 0.5);
	}
	return canvas;
}

// --- Brush Implementation ---
export class CharcoalBrush extends BaseBrush {
	private _trace: CharcoalPoint[] = [];
	private _stampCanvas!: HTMLCanvasElement;
	private _stampSize: number = 0;
	private _lastPoint?: Point;
	private _seed: number = 0;

	private _drawnDistance: number = 0;
	public maxDistance: number = 600;

	constructor(canvas: Canvas) {
		super(canvas);
	}

	onMouseDown(pointer: Point) {
		this._trace = [];
		this._drawnDistance = 0;
		this._seed = Math.floor(Math.random() * 1_000_000);
		this._stampSize = this.width * 2;
		this._stampCanvas = generateCharcoalStamp(this._seed, this.width, this.color);
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
				seed: this._seed,
				baseWidth: this.width,
			});

			this.canvas.add(stroke);
			this.canvas.clearContext(this.canvas.contextTop);
			this.canvas.fire("path:created", { path: stroke });
		}
		this._lastPoint = undefined;
		return false;
	}

	private _addPoint(pointer: Point, isFirstPoint = false) {
		if (isFirstPoint) {
			this._trace.push({ x: pointer.x, y: pointer.y, opacity: 1, offsetX: 0, offsetY: 0 });
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
			const depletion = Math.min(1, this._drawnDistance / this.maxDistance);
			const fadeRatio = 1 - depletion * 0.8;
			const t = i / steps;
			const x = this._lastPoint.x + (pointer.x - this._lastPoint.x) * t;
			const y = this._lastPoint.y + (pointer.y - this._lastPoint.y) * t;
			const dryFrictionMultiplier = 1 + depletion * 2.5;
			const jitter = (this.width / 6) * dryFrictionMultiplier;
			this._trace.push({
				x, y, opacity: fadeRatio,
				offsetX: (Math.random() - 0.5) * jitter,
				offsetY: (Math.random() - 0.5) * jitter
			});
			pointsAdded = true;
		}
		this._lastPoint = pointer;
		return pointsAdded;
	}

	_render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
		ctx.save();
		const vpt = this.canvas.viewportTransform;
		if (vpt) ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
		const radius = this._stampSize / 2;
		for (const p of this._trace) {
			ctx.globalAlpha = p.opacity;
			ctx.drawImage(this._stampCanvas, p.x + p.offsetX - radius, p.y + p.offsetY - radius, this._stampSize, this._stampSize);
		}
		ctx.restore();
	}
}

interface CharcoalPoint { x: number; y: number; opacity: number; offsetX: number; offsetY: number; }

// --- Stroke Implementation ---
export class CharcoalStroke extends FabricObject {
	static type = "CharcoalStroke";
	public trace: any[];
	public stampCanvas?: HTMLCanvasElement;
	public stampSize: number;
	public seed: number;
	public baseWidth: number;
	public minX: number = 0;
	public minY: number = 0;

	constructor(options: any) {
		super(options);
		this.trace = options.compressedTrace ? this._decodeTrace(options.compressedTrace) : (options.trace || []);
		this.stampSize = options.stampSize || 0;
		this.seed = options.seed;
		this.baseWidth = options.baseWidth || (options.stampSize / 2);
		this.stampCanvas = options.stampCanvas;
		this.minX = options.minX || 0;
		this.minY = options.minY || 0;
		this.originX = "center";
		this.originY = "center";
		if (typeof options.left !== "number") this._calcDimensions();
	}

	private _decodeTrace(compressed: number[]) {
		const trace = [];
		let lastX = 0, lastY = 0;
		for (let i = 0; i < compressed.length; i += 5) {
			let ix = compressed[i] + (i > 0 ? lastX : 0);
			let iy = compressed[i + 1] + (i > 0 ? lastY : 0);
			lastX = ix; lastY = iy;
			trace.push({ x: ix / 100, y: iy / 100, opacity: compressed[i + 2] / 100, offsetX: compressed[i + 3] / 100, offsetY: compressed[i + 4] / 100 });
		}
		return trace;
	}

	private _calcDimensions() {
		let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
		for (const p of this.trace) {
			const px = p.x + p.offsetX, py = p.y + p.offsetY;
			if (px < minX) minX = px; if (px > maxX) maxX = px;
			if (py < minY) minY = py; if (py > maxY) maxY = py;
		}
		this.minX = minX; this.minY = minY;
		this.width = maxX - minX + this.stampSize;
		this.height = maxY - minY + this.stampSize;
		this.left = minX - (this.stampSize / 2) + this.width / 2;
		this.top = minY - (this.stampSize / 2) + this.height / 2;
	}

	_render(ctx: CanvasRenderingContext2D) {
		if (!this.stampCanvas) return;
		const halfWidth = this.width / 2, halfHeight = this.height / 2;
		for (const p of this.trace) {
			ctx.globalAlpha = p.opacity;
			ctx.drawImage(this.stampCanvas, p.x + p.offsetX - this.minX - halfWidth, p.y + p.offsetY - this.minY - halfHeight, this.stampSize, this.stampSize);
		}
	}

	toObject(additionalProperties: string[] = []) {
		const flatTrace: number[] = [];
		let lastX = 0, lastY = 0;
		for (const p of this.trace) {
			const ix = Math.round(p.x * 100), iy = Math.round(p.y * 100);
			flatTrace.push(ix - lastX, iy - lastY, Math.round(p.opacity * 100), Math.round(p.offsetX * 100), Math.round(p.offsetY * 100));
			lastX = ix; lastY = iy;
		}
		return { ...super.toObject(["left", "top", "width", "height", "fill", "stampSize", "seed", "baseWidth", "minX", "minY", ...additionalProperties]), compressedTrace: flatTrace };
	}

	static async fromObject(object: any) {
		if (!object.stampCanvas && object.seed !== undefined) {
			object.stampCanvas = generateCharcoalStamp(object.seed, object.baseWidth, object.fill);
		}
		const enlivenedProps = await enlivenStrokeProps(object);
		return new CharcoalStroke(enlivenedProps);
	}
}