import { BaseBrush, Canvas, Path, Point, Shadow } from "fabric";
import { opacityFromOpacityHex } from "@/draw/utils/color.utils";
import {
	enlivenStrokeProps,
	toObjectWithoutPath,
} from "@/draw/utils/brushes/brush.helpers";
import {
	buildWatercolorBristles,
	buildWatercolorPathData,
	decodeWatercolorTrace,
	encodeWatercolorTrace,
	normalizeWatercolorPoints,
	simplifyWatercolorPoints,
	traceWatercolorPath,
	watercolorSimplifyTolerance,
	type WatercolorPathCommand,
	type WatercolorPoint,
} from "@/draw/utils/brushes/watercolorGeometry";

// ==========================================
// THE OPTIMIZED WATERCOLOR BRUSH
// ==========================================
/**
 * Raw points held back before being simplified into the frozen prefix.
 *
 * Simplification has to happen DURING the stroke, not only at commit: the
 * preview and the committed stroke must be the same geometry, or releasing the
 * pointer visibly changes the shape. Freezing in small chunks keeps the
 * per-move cost bounded (Douglas-Peucker over at most this many points) while
 * everything behind the chunk is already final.
 */
export const SIMPLIFY_CHUNK = 24;

/** The preview draws in world space, so it needs no path offset. */
const ORIGIN = { x: 0, y: 0 };

export class WaterColorBrush extends BaseBrush {
	protected declare _basePoints: Point[];
	/** Simplified and final — never revisited. */
	private _frozen: WatercolorPoint[] = [];
	/** Raw points since the last freeze; `_tail[0]` is the frozen anchor. */
	private _tail: WatercolorPoint[] = [];

	public decimate = 0.3;

	constructor(canvas: Canvas) {
		super(canvas);
	}

	private get _tolerance(): number {
		return watercolorSimplifyTolerance(this.width);
	}

	/**
	 * The points the stroke actually consists of: the frozen prefix plus the
	 * simplified tail. This is what the preview draws AND what gets committed,
	 * so the two cannot disagree by more than the last unfrozen chunk.
	 */
	private _strokePoints(): WatercolorPoint[] {
		if (this._tail.length <= 1) return this._frozen;
		const tail = simplifyWatercolorPoints(this._tail, this._tolerance);
		return this._frozen.concat(tail.slice(1));
	}

	onMouseDown(pointer: Point) {
		this._basePoints = [];
		this._frozen = [];
		this._tail = [];

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

		// Simplify ONCE, then use the same points for the geometry and the stored
		// trace — otherwise a reload rebuilds from denser points and the stroke
		// silently changes shape between sessions.
		//
		// The brush captures every 0.3px and each base point becomes three path
		// commands, so an unsimplified stroke carried thousands of commands it
		// could not show. CustomPencilBrush has always done this on commit; the
		// watercolour path just never called the helper that was sitting here.
		const basePoints = this._strokePoints();
		const pathData = WaterColorStroke.buildPathData(
			basePoints as Point[],
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

	private _addPoint(point: Point) {
		if (
			this._basePoints.length > 0 &&
			point.eq(this._basePoints[this._basePoints.length - 1])
		) {
			return false;
		}

		this._basePoints.push(point);
		const plain = { x: point.x, y: point.y };
		if (this._tail.length === 0 && this._frozen.length === 0) {
			this._frozen.push(plain);
			this._tail.push(plain);
			return true;
		}
		this._tail.push(plain);

		// Freeze the chunk once it is long enough to be worth simplifying, keeping
		// its last point as the anchor of the next one so the two joins seamlessly.
		if (this._tail.length > SIMPLIFY_CHUNK) {
			const simplified = simplifyWatercolorPoints(this._tail, this._tolerance);
			for (let i = 1; i < simplified.length; i++) {
				this._frozen.push(simplified[i]);
			}
			this._tail = [this._tail[this._tail.length - 1]];
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

		// Rendered through the SAME pair of functions the committed stroke uses,
		// from the same points. The preview used to re-implement the wave-and-noise
		// maths inline against every raw pointer sample, so it drifted from the
		// committed geometry three ways at once: a duplicated formula, a denser
		// point set, and no coordinate quantisation (`traceWatercolorPath` rounds
		// to 2dp to match the serialized Path exactly). One source of truth means
		// releasing the pointer cannot change the shape.
		traceWatercolorPath(
			ctx,
			buildWatercolorBristles(this._strokePoints(), this.width),
			ORIGIN,
			undefined,
			this.width * 0.8,
		);

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
			const width = object.strokeWidth / 0.8;
			const points = Array.isArray(object.compressedTrace)
				? decodeWatercolorTrace(object.compressedTrace)
				: normalizeWatercolorPoints(object.basePoints);
			// Simplify on the way IN as well. Drawings made before the brush did
			// this carry their original sub-pixel sampling, and they are exactly
			// the heavy canvases worth fixing — this lightens them on load without
			// rewriting anything on disk. Already-simplified traces are a no-op:
			// there is nothing left within tolerance to drop.
			path = buildWatercolorPathData(
				simplifyWatercolorPoints(points, watercolorSimplifyTolerance(width)),
				width,
			);
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
