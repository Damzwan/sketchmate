import { BaseBrush, Canvas, Path, Point, Shadow } from "fabric";
import { opacityFromOpacityHex } from "@/draw/utils/color.utils";
import {
	enlivenStrokeProps,
	simplifyPathDouglasPeucker,
} from "@/draw/utils/brushes/brush.helpers";

// ==========================================
// DETERMINISTIC NOISE HELPER
// ==========================================
/**
 * Position-hashed noise. CHAOTIC by construction (`sin(x*k)*43758` mod 1), so an
 * arbitrarily small change in x or y yields a COMPLETELY different value — it is
 * a hash, not a continuous function.
 *
 * That matters because `WaterColorStroke.toObject` stores `basePoints` rounded
 * to 0.1 (`Math.round(p.x * 10) / 10`) and drops the baked `path`, so
 * `fromObject` re-derives the bristle geometry from the ROUNDED points. Feeding
 * the hash unrounded coords when drawing and rounded coords when re-hydrating
 * produced two entirely different sets of bristles — the stroke visibly changed
 * shape the moment a tile baked from the serialized copy (the worker mirror
 * round-trips through exactly this path), and again after a reload or a sync.
 *
 * Fix: quantize to the SAME 0.1 grid the serializer uses, inside the hash. Then
 * `noise(x) === noise(round(x, 0.1))`, so live, committed, worker-baked and
 * reloaded renders are byte-identical. Quantizing here (not at the call sites)
 * makes the invariant impossible to forget.
 *
 * Keep this grid in sync with `toObject`'s rounding factor (10).
 */
const NOISE_GRID = 10; // 0.1 units — must match toObject's Math.round(p * 10)

function getDeterministicNoise(
	x: number,
	y: number,
	b: number,
): { nx: number; ny: number } {
	const qx = Math.round(x * NOISE_GRID) / NOISE_GRID;
	const qy = Math.round(y * NOISE_GRID) / NOISE_GRID;
	const seedX = qx * 12.9898 + qy * 78.233 + b * 13.5;
	const seedY = qx * 78.233 + qy * 12.9898 + b * 31.7;
	const nx = (Math.abs(Math.sin(seedX) * 43758.5453) % 1) - 0.5;
	const ny = (Math.abs(Math.sin(seedY) * 43758.5453) % 1) - 0.5;
	return { nx, ny };
}

// ==========================================
// THE OPTIMIZED WATERCOLOR BRUSH
// ==========================================
export class WaterColorBrush extends BaseBrush {
	protected declare _basePoints: Point[];
	protected declare _bristlePoints: Point[][];
	protected _totalDistance: number = 0;

	public decimate = 0.3;

	constructor(canvas: Canvas) {
		super(canvas);
	}

	onMouseDown(pointer: Point) {
		this._basePoints = [];
		this._bristlePoints = [[], [], []];
		this._totalDistance = 0;

		this._addPoint(pointer);
		this._render();
	}

	onMouseMove(pointer: Point) {
		if (this.decimate > 0 && this._basePoints.length > 0) {
			const lastPoint = this._basePoints[this._basePoints.length - 1];
			const distance = Math.hypot(
				pointer.x - lastPoint.x,
				pointer.y - lastPoint.y,
			);
			if (distance < this.decimate) return;
		}

		if (this._addPoint(pointer) && this._basePoints.length > 1) {
			this.canvas.clearContext(this.canvas.contextTop);
			this._render();
		}
	}

	onMouseUp() {
		// length 1 = a quick tap. Keep it — buildPathString renders a round-capped
		// dab for a single point, so a tap stamps a dot instead of being dropped.
		if (!this._basePoints || this._basePoints.length < 1) {
			this.canvas.clearContext(this.canvas.contextTop);
			return false;
		}

		const pathString = WaterColorStroke.buildPathString(
			this._basePoints,
			this.width,
		);

		if (pathString) {
			const baseOpacity = opacityFromOpacityHex(this.color) || 0.6;

			const path = new WaterColorStroke(pathString, {
				fill: "",
				stroke: this.color,
				strokeWidth: this.width * 0.8,
				strokeLineCap: "round",
				strokeLineJoin: "round",
				opacity: baseOpacity * 0.45,
				globalCompositeOperation: "source-over",
				interactive: false,
				basePoints: [...this._basePoints],
			});

			// Shadow attachment block completely removed here.
			// The tile engine will now cleanly cache the vector path geometry.

			this.canvas.add(path);
			this.canvas.fire("path:created", { path });
		}

		this.canvas.clearContext(this.canvas.contextTop);
		if (this.canvas.contextTop?.canvas) {
			(this.canvas.contextTop.canvas as HTMLElement).style.mixBlendMode =
				"normal";
		}
		return false;
	}

	private _simplifyBasePoints(points: Point[], tolerance: number): Point[] {
		if (points.length <= 2) return points;

		const pathData = points.map((p, i) => [i === 0 ? "M" : "L", p.x, p.y]);
		const simplifiedData = simplifyPathDouglasPeucker(
			pathData as any,
			tolerance,
		);

		return simplifiedData.map((cmd: any) => new Point(cmd[1], cmd[2]));
	}

	private _addPoint(point: Point) {
		if (
			this._basePoints.length > 0 &&
			point.eq(this._basePoints[this._basePoints.length - 1])
		) {
			return false;
		}

		let dist = 0;
		if (this._basePoints.length > 0) {
			const prev = this._basePoints[this._basePoints.length - 1];
			dist = prev.distanceFrom(point);
		}

		this._totalDistance += dist;
		this._basePoints.push(point);

		const speedFactor = Math.min(1, dist / 20);
		const spreadMultiplier = 1.2 - speedFactor * 0.7;

		for (let b = 0; b < 3; b++) {
			const wave =
				Math.sin(this._totalDistance * 0.05 + b) *
				(this.width * 0.15 * spreadMultiplier);

			const { nx, ny } = getDeterministicNoise(point.x, point.y, b);
			const noiseX = nx * (this.width * 0.2 * spreadMultiplier);
			const noiseY = ny * (this.width * 0.2 * spreadMultiplier);

			this._bristlePoints[b].push(
				new Point(point.x + wave + noiseX, point.y + wave + noiseY),
			);
		}
		return true;
	}

	_render(ctx: CanvasRenderingContext2D = this.canvas.contextTop) {
		if (!this._basePoints.length) return;

		this._saveAndTransform(ctx);

		const baseOpacity = opacityFromOpacityHex(this.color) || 0.6;
		ctx.globalAlpha = baseOpacity * 0.45;
		ctx.strokeStyle = this.color;
		ctx.lineWidth = this.width * 0.8;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";

		ctx.beginPath();
		for (let b = 0; b < this._bristlePoints.length; b++) {
			const points = this._bristlePoints[b];
			if (points.length === 0) continue;

			let p1 = points[0];
			ctx.moveTo(p1.x, p1.y);

			for (let i = 1; i < points.length; i++) {
				const p2 = points[i];
				const mid = p1.midPointFrom(p2);
				ctx.quadraticCurveTo(p1.x, p1.y, mid.x, mid.y);
				p1 = p2;
			}
			ctx.lineTo(p1.x, p1.y);
		}

		ctx.stroke();
		ctx.restore();
	}
}

// ==========================================
// THE OPTIMIZED WATERCOLOR STROKE
// ==========================================
export class WaterColorStroke extends Path {
	static type = "WaterColorStroke";
	static cacheProperties = [...Path.cacheProperties, "basePoints"];

	public basePoints: Point[];

	constructor(path: string | any[], options: any) {
		super(path, options);

		if (options.compressedTrace && Array.isArray(options.compressedTrace)) {
			this.basePoints = [];
			let lastX = 0,
				lastY = 0;
			for (let i = 0; i < options.compressedTrace.length; i += 2) {
				let ix = options.compressedTrace[i];
				let iy = options.compressedTrace[i + 1];

				if (i > 0) {
					ix += lastX;
					iy += lastY;
				}
				lastX = ix;
				lastY = iy;
				this.basePoints.push(new Point(ix / 10, iy / 10));
			}
		} else {
			this.basePoints = options.basePoints || [];
		}
	}

	// @ts-ignore
	toObject(additionalProperties: string[] = []) {
		const flatTrace: number[] = [];
		let lastX = 0,
			lastY = 0;

		for (let i = 0; i < this.basePoints.length; i++) {
			const p = this.basePoints[i];
			const ix = Math.round(p.x * 10);
			const iy = Math.round(p.y * 10);

			if (i === 0) {
				flatTrace.push(ix, iy);
			} else {
				flatTrace.push(ix - lastX, iy - lastY);
			}
			lastX = ix;
			lastY = iy;
		}

		const baseObj = super.toObject([...additionalProperties] as any);
		delete (baseObj as any).path;

		return {
			...baseObj,
			compressedTrace: flatTrace,
		};
	}

	static async fromObject(object: any) {
		if (!object.path || object.path.length === 0) {
			const tempInstance = new WaterColorStroke([], object);
			object.path = WaterColorStroke.buildPathString(
				tempInstance.basePoints,
				object.strokeWidth / 0.8,
			);
		}
		const enlivenedProps = await enlivenStrokeProps(object);
		return new WaterColorStroke(object.path, enlivenedProps);
	}

	static buildPathString(basePoints: Point[], width: number): string {
		const bristlePoints: Point[][] = [[], [], []];
		let totalDist = 0;

		for (let i = 0; i < basePoints.length; i++) {
			const point = basePoints[i];
			let dist = 0;
			if (i > 0) {
				dist = basePoints[i - 1].distanceFrom(point);
				totalDist += dist;
			}

			const speedFactor = Math.min(1, dist / 20);
			const spreadMultiplier = 1.2 - speedFactor * 0.7;

			for (let b = 0; b < 3; b++) {
				const wave =
					Math.sin(totalDist * 0.05 + b) * (width * 0.15 * spreadMultiplier);

				const { nx, ny } = getDeterministicNoise(point.x, point.y, b);
				const noiseX = nx * (width * 0.2 * spreadMultiplier);
				const noiseY = ny * (width * 0.2 * spreadMultiplier);

				bristlePoints[b].push(
					new Point(point.x + wave + noiseX, point.y + wave + noiseY),
				);
			}
		}

		let pathString = "";
		for (let b = 0; b < bristlePoints.length; b++) {
			const points = bristlePoints[b];
			if (points.length > 0) {
				let p1 = points[0];
				pathString += `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} `;
				for (let i = 1; i < points.length; i++) {
					const p2 = points[i];
					const mid = p1.midPointFrom(p2);
					pathString += `Q ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} ${mid.x.toFixed(2)} ${mid.y.toFixed(2)} `;
					p1 = p2;
				}
				pathString += `L ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} `;
			}
		}
		return pathString;
	}
}
