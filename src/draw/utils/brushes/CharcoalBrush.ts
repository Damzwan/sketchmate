import { BaseBrush, FabricObject, type Point } from "fabric";
import { getTopContextEpoch } from "@/draw/rendering/fabricRenderState";
import {
	enlivenStrokeProps,
	TEXTURE_SUPERSAMPLE,
} from "@/draw/utils/brushes/brush.helpers";

// --- Utility: Deterministic Generator ---
export function seededRandom(seed: number) {
	return () => {
		seed = (seed * 9301 + 49297) % 233280;
		return seed / 233280;
	};
}

const CHARCOAL_MAX_SUPERSAMPLE = 4;
const CHARCOAL_MAX_STAMP_DIMENSION = 200;
const CHARCOAL_REFINEMENT_MAX_DIMENSION = 128;

/**
 * Give normal charcoal tips enough source pixels to stay crisp through the
 * common high-resolution tile tiers, without letting large brush widths create
 * oversized per-stroke canvases. Width 50 already produced a 200px stamp at the
 * shared 2x baseline, so this does not raise the existing worst-case dimension.
 */
export function charcoalTextureSupersample(width: number): number {
	const stampSize = Math.max(0.2, width * 2);
	return Math.max(
		TEXTURE_SUPERSAMPLE,
		Math.min(
			CHARCOAL_MAX_SUPERSAMPLE,
			CHARCOAL_REFINEMENT_MAX_DIMENSION / stampSize,
		),
	);
}

export function charcoalTextureDimension(width: number): number {
	const stampSize = Math.max(0.2, width * 2);
	return Math.max(
		1,
		Math.min(
			CHARCOAL_MAX_STAMP_DIMENSION,
			Math.ceil(stampSize * charcoalTextureSupersample(width)),
		),
	);
}

export function generateCharcoalStamp(
	seed: number,
	width: number,
	color: string,
): HTMLCanvasElement {
	const rand = seededRandom(seed);
	// Device-independent — see TEXTURE_SUPERSAMPLE. Was devicePixelRatio-based,
	// which made the worker (no devicePixelRatio → 1) and the main thread (2–3)
	// generate DIFFERENT grain for the same stroke, so it changed appearance the
	// moment its tile baked. This charcoal-only value is still deterministic:
	// it depends only on the serialized width, never on the rendering device.
	const stampSize = width * 2;
	const physical = charcoalTextureDimension(width);
	const SS = physical / stampSize;

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
	/** Live-preview incremental state — see _render. */
	private _renderedUpTo = 0;
	private _renderedVpt = "";
	private _renderedEpoch = -1;

	onMouseDown(pointer: Point) {
		this._trace = [];
		this._drawnDistance = 0;
		this._seed = Math.floor(Math.random() * 1_000_000);
		this._stampSize = this.width * 2;
		this._stampCanvas = generateCharcoalStamp(
			this._seed,
			this.width,
			this.color,
		);
		this._renderedUpTo = 0; // new stroke → repaint from scratch
		this._renderedVpt = "";
		this._lastPoint = pointer;
		this._addPoint(pointer, true);
	}

	onMouseMove(pointer: Point) {
		// NB: no clearContext here — _render draws only the NEW stamps (see there).
		if (this._addPoint(pointer)) this._render();
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
			const depletion = Math.min(1, this._drawnDistance / this.maxDistance);
			const fadeRatio = 1 - depletion * 0.8;
			const t = i / steps;
			const x = this._lastPoint.x + (pointer.x - this._lastPoint.x) * t;
			const y = this._lastPoint.y + (pointer.y - this._lastPoint.y) * t;
			const dryFrictionMultiplier = 1 + depletion * 2.5;
			const jitter = (this.width / 6) * dryFrictionMultiplier;
			this._trace.push({
				x,
				y,
				opacity: fadeRatio,
				offsetX: (Math.random() - 0.5) * jitter,
				offsetY: (Math.random() - 0.5) * jitter,
			});
			pointsAdded = true;
		}
		this._lastPoint = pointer;
		return pointsAdded;
	}

	/**
	 * INCREMENTAL live preview.
	 *
	 * This used to clear the top context and redraw EVERY stamp on every pointer
	 * move, so a stroke of n stamps cost O(n²) `drawImage` calls — a 500-stamp
	 * stroke ≈ 125k blits instead of 500, getting worse the longer you draw, and
	 * competing with the tile engine on a busy canvas.
	 *
	 * Each stamp is composited exactly once either way (the old code cleared
	 * first), so drawing only the NEW ones is pixel-identical and O(n) total.
	 *
	 * Two cases still force a full repaint, both handled here:
	 *   • the viewport moved — the preview is drawn in WORLD space through the
	 *     vpt, so a mid-stroke zoom/pan invalidates everything already on screen;
	 *   • the trace shrank / a new stroke started (`_renderedUpTo` out of range).
	 */
	_render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
		const vpt = this.canvas.viewportTransform;
		const vptKey = vpt ? vpt.join(",") : "";
		const isTop = ctx === this.canvas.contextTop;
		const stale =
			vptKey !== this._renderedVpt ||
			getTopContextEpoch() !== this._renderedEpoch ||
			this._renderedUpTo > this._trace.length;

		let from = this._renderedUpTo;
		if (!isTop || stale) {
			if (isTop) this.canvas.clearContext(ctx);
			from = 0;
		}

		ctx.save();
		if (vpt) ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
		const radius = this._stampSize / 2;
		for (let i = from; i < this._trace.length; i++) {
			const p = this._trace[i];
			ctx.globalAlpha = p.opacity;
			ctx.drawImage(
				this._stampCanvas,
				p.x + p.offsetX - radius,
				p.y + p.offsetY - radius,
				this._stampSize,
				this._stampSize,
			);
		}
		ctx.restore();

		if (isTop) {
			this._renderedUpTo = this._trace.length;
			this._renderedVpt = vptKey;
			this._renderedEpoch = getTopContextEpoch();
		}
	}
}

interface CharcoalPoint {
	x: number;
	y: number;
	opacity: number;
	offsetX: number;
	offsetY: number;
}

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
		this.trace = options.compressedTrace
			? this._decodeTrace(options.compressedTrace)
			: options.trace || [];
		this.stampSize = options.stampSize || 0;
		this.seed = options.seed;
		this.baseWidth = options.baseWidth || options.stampSize / 2;
		this.stampCanvas = options.stampCanvas;
		this.minX = options.minX || 0;
		this.minY = options.minY || 0;
		this.originX = "center";
		this.originY = "center";
		if (typeof options.left !== "number") this._calcDimensions();
	}

	private _decodeTrace(compressed: number[]) {
		const trace = [];
		let lastX = 0,
			lastY = 0;
		for (let i = 0; i < compressed.length; i += 5) {
			const ix = compressed[i] + (i > 0 ? lastX : 0);
			const iy = compressed[i + 1] + (i > 0 ? lastY : 0);
			lastX = ix;
			lastY = iy;
			trace.push({
				x: ix / 100,
				y: iy / 100,
				opacity: compressed[i + 2] / 100,
				offsetX: compressed[i + 3] / 100,
				offsetY: compressed[i + 4] / 100,
			});
		}
		return trace;
	}

	private _calcDimensions() {
		let minX = Infinity,
			maxX = -Infinity,
			minY = Infinity,
			maxY = -Infinity;
		for (const p of this.trace) {
			const px = p.x + p.offsetX,
				py = p.y + p.offsetY;
			if (px < minX) minX = px;
			if (px > maxX) maxX = px;
			if (py < minY) minY = py;
			if (py > maxY) maxY = py;
		}
		this.minX = minX;
		this.minY = minY;
		this.width = maxX - minX + this.stampSize;
		this.height = maxY - minY + this.stampSize;
		this.left = minX - this.stampSize / 2 + this.width / 2;
		this.top = minY - this.stampSize / 2 + this.height / 2;
	}

	_render(ctx: CanvasRenderingContext2D) {
		if (!this.stampCanvas) return;
		const halfWidth = this.width / 2,
			halfHeight = this.height / 2;
		for (const p of this.trace) {
			ctx.globalAlpha = p.opacity;
			ctx.drawImage(
				this.stampCanvas,
				p.x + p.offsetX - this.minX - halfWidth,
				p.y + p.offsetY - this.minY - halfHeight,
				this.stampSize,
				this.stampSize,
			);
		}
	}

	toObject(additionalProperties: string[] = []) {
		const flatTrace: number[] = [];
		let lastX = 0,
			lastY = 0;
		for (const p of this.trace) {
			const ix = Math.round(p.x * 100),
				iy = Math.round(p.y * 100);
			flatTrace.push(
				ix - lastX,
				iy - lastY,
				Math.round(p.opacity * 100),
				Math.round(p.offsetX * 100),
				Math.round(p.offsetY * 100),
			);
			lastX = ix;
			lastY = iy;
		}
		return {
			...super.toObject([
				"left",
				"top",
				"width",
				"height",
				"fill",
				"stampSize",
				"seed",
				"baseWidth",
				"minX",
				"minY",
				...additionalProperties,
			]),
			compressedTrace: flatTrace,
		};
	}

	static async fromObject(object: any) {
		// Attach the stamp to the COPY, never to `object`. An HTMLCanvasElement in
		// the source blob makes it un-structured-cloneable, and at load that blob
		// is stashed as `__bakeJSON` and posted to the tile worker — postMessage
		// then threw and the fallback re-serialized the whole batch with
		// JSON.stringify/parse on the main thread (the dense-load stall).
		const props = await enlivenStrokeProps(object);
		if (!props.stampCanvas && object.seed !== undefined) {
			props.stampCanvas = generateCharcoalStamp(
				object.seed,
				object.baseWidth,
				object.fill,
			);
		}
		return new CharcoalStroke(props);
	}
}
