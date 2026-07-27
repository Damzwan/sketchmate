import { BaseBrush, Canvas, Path, Point, Shadow } from "fabric";
import { opacityFromOpacityHex } from "@/draw/utils/color.utils";
import {
	enlivenStrokeProps,
	simplifyPathDouglasPeucker,
	toObjectWithoutPath,
} from "@/draw/utils/brushes/brush.helpers";
import {
	buildWatercolorPathData,
	decodeWatercolorTrace,
	deterministicWatercolorNoise,
	encodeWatercolorTrace,
	normalizeWatercolorPoints,
	type WatercolorPathCommand,
} from "@/draw/utils/brushes/watercolorGeometry";

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

		const pathData = WaterColorStroke.buildPathData(
			this._basePoints,
			this.width,
		);

		if (pathData.length) {
			const baseOpacity = opacityFromOpacityHex(this.color) || 0.6;

			const path = new WaterColorStroke(pathData, {
				fill: "",
				stroke: this.color,
				strokeWidth: this.width * 0.8,
				strokeLineCap: "round",
				strokeLineJoin: "round",
				opacity: baseOpacity * 0.45,
				globalCompositeOperation: "source-over",
				interactive: false,
				compressedTrace: encodeWatercolorTrace(this._basePoints),
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

			const { nx, ny } = deterministicWatercolorNoise(point.x, point.y, b);
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
	static cacheProperties = [...Path.cacheProperties, "compressedTrace"];

	public readonly compressedTrace: number[];

	constructor(path: string | any[], options: any) {
		super(path, options);

		if (options.compressedTrace && Array.isArray(options.compressedTrace)) {
			// Immutable after construction. Sharing this array avoids a second
			// trace while loading or saving a dense watercolor drawing.
			this.compressedTrace = options.compressedTrace;
		} else {
			// Compact legacy `{x, y}` objects once instead of retaining another
			// object graph for the lifetime of the stroke.
			this.compressedTrace = encodeWatercolorTrace(
				normalizeWatercolorPoints(options.basePoints),
			);
		}
	}

	// @ts-ignore
	toObject(additionalProperties: string[] = []) {
		// Path.toObject deep-copies every segment and it is discarded — fromObject
		// rebuilds from `compressedTrace`. A watercolor stroke is 3 bristles × N
		// base points, so `this.path` holds ~3N commands: the worst case of the
		// waste toObjectWithoutPath exists to remove.
		const baseObj = toObjectWithoutPath(this, (p) => super.toObject(p as any), [
			...additionalProperties,
		]);

		return {
			...baseObj,
			compressedTrace: this.compressedTrace,
		};
	}

	static async fromObject(object: any) {
		// Never write the expanded path back into `object`. drawload.helper stashes
		// that exact source blob as __bakeJSON; mutating it made the compact trace
		// carry a second, huge SVG path through structured clone and into the
		// worker's permanent mirror.
		let path = object.path;
		if (!path || path.length === 0) {
			const points = Array.isArray(object.compressedTrace)
				? decodeWatercolorTrace(object.compressedTrace)
				: normalizeWatercolorPoints(object.basePoints);
			path = buildWatercolorPathData(points, object.strokeWidth / 0.8);
		}
		const enlivenedProps = await enlivenStrokeProps(object);
		return new WaterColorStroke(path, enlivenedProps);
	}

	static buildPathData(
		basePoints: Point[],
		width: number,
	): WatercolorPathCommand[] {
		return buildWatercolorPathData(basePoints, width);
	}

	/** Compatibility helper for old callers/tools that expect SVG path text. */
	static buildPathString(basePoints: Point[], width: number): string {
		return buildWatercolorPathData(basePoints, width)
			.map((command) => command.join(" "))
			.join(" ");
	}
}
