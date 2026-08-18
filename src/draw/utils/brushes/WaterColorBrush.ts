import { BaseBrush, Path, type Point } from "fabric";
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
	thinLegacyWatercolorTrace,
	toWatercolorTrace,
	traceWatercolorPath,
	type WatercolorPathCommand,
	type WatercolorPoint,
	type WatercolorTrace,
	watercolorSampleSpacing,
	watercolorTraceToJSON,
} from "@/draw/utils/brushes/watercolorGeometry";
import { opacityFromOpacityHex } from "@/draw/utils/color.utils";

// ==========================================
// THE OPTIMIZED WATERCOLOR BRUSH
// ==========================================
/**
 * A watercolour stroke is APPEND-ONLY.
 *
 * Every sample the brush accepts is final: nothing already on screen is ever
 * re-derived, re-simplified or re-fitted while the pointer is down, so the
 * ribbon behind the finger cannot move. The thinning that keeps a stroke light
 * happens at INPUT time instead — see `watercolorSampleSpacing`, which explains
 * why Douglas-Peucker is the wrong tool for this brush at any tolerance.
 *
 * That property has to hold end to end: preview, commit and reload all build
 * from the same accepted samples through the same functions, so releasing the
 * pointer and re-opening the drawing cannot change the shape either.
 */

/** The preview draws in world space, so it needs no path offset. */
const ORIGIN = { x: 0, y: 0 };

export class WaterColorBrush extends BaseBrush {
	protected declare _basePoints: Point[];
	/** Accepted samples. Append-only for the lifetime of the stroke. */
	private _points: WatercolorPoint[] = [];

	/**
	 * Set per stroke from the brush width. BaseBrush's own `decimate` is a
	 * constant; the right spacing here depends on how wide the wiggle is.
	 */
	public decimate = watercolorSampleSpacing(10);

	private _strokePoints(): WatercolorPoint[] {
		return this._points;
	}

	onMouseDown(pointer: Point) {
		this._basePoints = [];
		this._points = [];
		// Locked in for the whole stroke: changing width mid-stroke is not a thing,
		// and re-reading it per move would let a spacing change re-space the tail.
		this.decimate = watercolorSampleSpacing(this.width);

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

		// EXACTLY the samples the preview drew — no commit-time pass of any kind.
		// The thinning already happened at input, so there is nothing left to drop
		// that would not also change the shape the user watched appear.
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
				compressedTrace: encodeWatercolorTrace(basePoints),
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
		this._points.push({ x: point.x, y: point.y });
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
	static override type = "WaterColorStroke";
	static override cacheProperties = [
		...Path.cacheProperties,
		"compressedTrace",
	];

	/**
	 * Float32Array, not `number[]` — half the bytes, and this is the most
	 * numerous object on a real canvas. See WatercolorTrace. Immutable after
	 * construction.
	 */
	public readonly compressedTrace: WatercolorTrace;

	constructor(path: string | any[], options: any) {
		super(path, options);

		const supplied = toWatercolorTrace(options.compressedTrace);
		if (supplied) {
			this.compressedTrace = supplied;
		} else {
			// Compact legacy `{x, y}` objects once instead of retaining another
			// object graph for the lifetime of the stroke.
			this.compressedTrace = encodeWatercolorTrace(
				normalizeWatercolorPoints(options.basePoints),
			);
		}
	}

	// @ts-expect-error
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
			// Back to a plain array: a typed array JSON-serializes as `{"0":…}`,
			// which no peer and no saved drawing could read back.
			compressedTrace: watercolorTraceToJSON(this.compressedTrace),
		};
	}

	static override async fromObject(object: any) {
		// Never write the expanded path back into `object`. drawload.helper stashes
		// that exact source blob as __bakeJSON; mutating it made the compact trace
		// carry a second, huge SVG path through structured clone and into the
		// worker's permanent mirror.
		let path = object.path;
		if (!path || path.length === 0) {
			const width = object.strokeWidth / 0.8;
			const trace = toWatercolorTrace(object.compressedTrace);
			const points = trace
				? decodeWatercolorTrace(trace)
				: normalizeWatercolorPoints(object.basePoints);
			// Legacy traces only. Drawings made before input decimation carry a
			// sample every 0.3px and would rebuild into thousands of commands, so
			// they get thinned here — nobody is watching those strokes appear, so
			// re-shaping them costs nothing. A trace already at the brush's sampling
			// spacing is returned untouched, which is what makes a stroke rebuild
			// EXACTLY as it was drawn. Douglas-Peucker used to run here instead and
			// could not tell the two cases apart.
			path = buildWatercolorPathData(
				thinLegacyWatercolorTrace(points, watercolorSampleSpacing(width)),
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
