import { BaseBrush, Path, type Point } from "fabric";
import {
	enlivenStrokeProps,
	toObjectWithoutPath,
} from "@/draw/utils/brushes/brush.helpers";

/**
 * A broad-nib calligraphy pen, modelled the way the real tool works.
 *
 * WHY THIS WAS REWRITTEN
 *
 * The previous version built ONE closed polygon: down the left offset edge and
 * back along the right one. That construction only holds while the stroke never
 * turns through the nib axis. The moment it does — every serifed turn, every
 * loop, every letter — the two edges swap sides, the outline crosses itself and
 * `nonzero` fills the resulting bowtie solid. That is where the "weird shapes"
 * came from: not a tuning problem, a topology one. A thin dark outline was
 * stroked around that same self-crossing polygon, which drew seams through the
 * middle of the ink.
 *
 * THE MODEL
 *
 * A broad nib is a rigid, flat edge held at a fixed angle. Ink covers exactly
 * the region the nib sweeps. So: put the nib footprint (a thin rectangle) at
 * every point along the path and take the union of consecutive sweeps.
 *
 * Each sweep is emitted as its own CLOSED, CONVEX subpath — the convex hull of
 * the nib rectangle at both ends. Convex subpaths cannot self-intersect, and
 * `nonzero` unions overlapping subpaths for free, so the ink is always a clean
 * solid no matter how sharply the stroke turns. There is nothing left to stroke
 * an outline around, so the seams are gone with it.
 *
 * WHAT MAKES IT LOOK EXPENSIVE
 *
 *   • Thick↔thin comes from geometry, not from a width curve: travel across the
 *     nib opens to full width, travel along it closes to the nib's own
 *     thickness. That contrast IS calligraphy.
 *   • The nib has real THICKNESS, so a stroke along the nib axis leaves a
 *     hairline instead of vanishing — exactly what a steel nib does, and what
 *     makes the thin strokes of an italic hand.
 *   • Ink pools where the pen slows or turns (a touch more thickness), which is
 *     what gives entries, exits and corners their weight.
 *   • Ends are cut at the nib angle. Real broad-nib strokes have chisel
 *     terminals; a taper would read as a felt pen.
 *
 * WHAT KEEPS IT FAST
 *
 *   • Collinear sweeps are MERGED: a straight run is one hull, not forty. The
 *     command count tracks how much the stroke turns, not how long it is.
 *   • The live preview is incremental. Finished sweeps are appended to a
 *     retained Path2D and never rebuilt, so a long stroke costs the same per
 *     pointer move as a short one. The old preview re-serialized the entire
 *     path to a string and re-parsed it on every move.
 */

export interface RawPoint {
	x: number;
	y: number;
	time: number;
}

/** Classic italic pen angle: the nib edge points up and to the right. */
const NIB_ANGLE = -Math.PI / 4;
const NIB_EX = Math.cos(NIB_ANGLE);
const NIB_EY = Math.sin(NIB_ANGLE);

/**
 * The steel itself — half the hairline, as a fraction of the nib's width.
 *
 * The whole drama of a broad nib is the RATIO between its two axes. At 0.075
 * the hairline was a fifth of the broad stroke and the contrast read as a
 * chisel marker; 0.04 puts it near a tenth, which is where an italic hand
 * starts to look like one.
 */
const NIB_THICKNESS_RATIO = 0.04;
const MIN_NIB_THICKNESS = 0.6;

/** Raw points that must pile up before the preview settles another window. */
const SETTLE_CHUNK = 12;

/** A sweep is extended while the direction holds to within this. */
const MERGE_ANGLE_TOLERANCE = 0.09; // ~5°
/** …and while the nib load has not drifted more than this. */
const MERGE_LOAD_TOLERANCE = 0.06;

interface NibSample {
	x: number;
	y: number;
	/** Half the nib EDGE length — how far the ink reaches along the nib. */
	half: number;
	/** Half the nib THICKNESS — the hairline, swelling where ink pools. */
	thick: number;
}

interface Vec {
	x: number;
	y: number;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Raw pointer samples → an evenly spaced, smoothed centreline carrying the nib
 * geometry at each point.
 *
 * Catmull-Rom through the captured points: a broad nib is unforgiving about
 * centreline quality, because any kink in the path becomes a visible facet in
 * a wide ribbon.
 */
function buildNibSamples(
	rawPoints: readonly RawPoint[],
	baseWidth: number,
): NibSample[] {
	const width = Number.isFinite(baseWidth) && baseWidth > 0 ? baseWidth : 40;
	const thickness = Math.max(MIN_NIB_THICKNESS, width * NIB_THICKNESS_RATIO);

	// De-duplicate and read the pen's speed while we still have the timestamps.
	const points: { x: number; y: number; flow: number }[] = [];
	for (let i = 0; i < rawPoints.length; i++) {
		const point = rawPoints[i];
		if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
		if (i === 0) {
			points.push({ x: point.x, y: point.y, flow: 1 });
			continue;
		}
		const previous = rawPoints[i - 1];
		const travelled = Math.hypot(point.x - previous.x, point.y - previous.y);
		if (travelled < 0.01) continue;
		const dt = Math.max(1, point.time - previous.time);
		// 1 = the pen is dwelling (ink pools), 0 = a fast confident sweep.
		const flow = Math.max(0, Math.min(1, 1 - travelled / dt / 2.5));
		points.push({ x: point.x, y: point.y, flow });
	}
	if (points.length === 0) return [];
	if (points.length === 1) {
		return [
			{ x: points[0].x, y: points[0].y, half: width / 2, thick: thickness },
		];
	}

	// Smooth the flow in both directions: ink spreads, it does not switch.
	for (let i = 1; i < points.length; i++)
		points[i].flow = points[i].flow * 0.35 + points[i - 1].flow * 0.65;
	for (let i = points.length - 2; i >= 0; i--)
		points[i].flow = points[i].flow * 0.35 + points[i + 1].flow * 0.65;

	// Fine enough that a curve reads as a curve, coarse enough that a long
	// stroke does not explode. Merging downstream removes the redundancy on the
	// straight parts anyway.
	const spacing = Math.max(1.2, Math.min(4, width * 0.12));
	const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))];

	const samples: NibSample[] = [];
	const push = (x: number, y: number, flow: number) => {
		samples.push({
			x,
			y,
			// The nib is rigid. Load moves the edge length by a few percent, no
			// more — anything larger stops reading as a pen and starts reading as
			// a pressure-sensitive marker.
			half: (width / 2) * (0.93 + 0.07 * flow),
			// Pooling, on the other hand, is very visible and belongs on the
			// hairline axis: dwell and the thin strokes fatten.
			thick: thickness * (1 + 0.35 * flow),
		});
	};

	for (let i = 0; i < points.length - 1; i++) {
		const p0 = at(i - 1);
		const p1 = at(i);
		const p2 = at(i + 1);
		const p3 = at(i + 2);
		const segmentLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
		const steps = Math.max(1, Math.ceil(segmentLength / spacing));
		for (let s = 0; s < steps; s++) {
			const t = s / steps;
			const t2 = t * t;
			const t3 = t2 * t;
			const x =
				0.5 *
				(2 * p1.x +
					(-p0.x + p2.x) * t +
					(2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
					(-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
			const y =
				0.5 *
				(2 * p1.y +
					(-p0.y + p2.y) * t +
					(2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
					(-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
			push(x, y, p1.flow + (p2.flow - p1.flow) * t);
		}
	}
	const last = points[points.length - 1];
	push(last.x, last.y, last.flow);
	return samples;
}

/**
 * The four corners of the nib pressed down at one sample.
 *
 * Rounded HERE, to the precision the path string will carry. Rounding after the
 * hull instead can nudge a near-collinear vertex across the line and emit a
 * subpath that is very slightly concave — which is exactly the class of defect
 * this construction exists to rule out.
 */
function nibCorners(sample: NibSample, into: Vec[], offset: number): void {
	const ax = NIB_EX * sample.half;
	const ay = NIB_EY * sample.half;
	// Perpendicular to the nib edge — the steel's thickness.
	const bx = -NIB_EY * sample.thick;
	const by = NIB_EX * sample.thick;
	into[offset] = {
		x: round2(sample.x + ax + bx),
		y: round2(sample.y + ay + by),
	};
	into[offset + 1] = {
		x: round2(sample.x + ax - bx),
		y: round2(sample.y + ay - by),
	};
	into[offset + 2] = {
		x: round2(sample.x - ax - bx),
		y: round2(sample.y - ay - by),
	};
	into[offset + 3] = {
		x: round2(sample.x - ax + bx),
		y: round2(sample.y - ay + by),
	};
}

/**
 * Convex hull (monotone chain) of the eight corners of two nib footprints.
 *
 * The union of a convex shape and its sweep to another position IS the hull of
 * the two, so this is exact for a straight move and a tight over-approximation
 * for the near-straight runs the merger allows.
 */
function hull(points: Vec[]): Vec[] {
	const sorted = points
		.slice()
		.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
	const cross = (o: Vec, a: Vec, b: Vec) =>
		(a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

	const lower: Vec[] = [];
	for (const point of sorted) {
		while (
			lower.length >= 2 &&
			cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
		)
			lower.pop();
		lower.push(point);
	}
	const upper: Vec[] = [];
	for (let i = sorted.length - 1; i >= 0; i--) {
		const point = sorted[i];
		while (
			upper.length >= 2 &&
			cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
		)
			upper.pop();
		upper.push(point);
	}
	lower.pop();
	upper.pop();
	return lower.concat(upper);
}

function subpath(points: Vec[]): string {
	if (points.length < 3) return "";
	let d = `M ${points[0].x} ${points[0].y}`;
	for (let i = 1; i < points.length; i++) {
		d += ` L ${points[i].x} ${points[i].y}`;
	}
	return `${d} Z`;
}

/** One nib footprint, for a tap that never travelled. */
function nibDab(sample: NibSample): string {
	const corners: Vec[] = new Array(4);
	nibCorners(sample, corners, 0);
	return subpath(corners);
}

/**
 * Sweep the nib along the samples, merging runs that hold their direction.
 *
 * `from` lets the live preview emit only the sweeps it has not emitted yet;
 * the returned `next` is where the following call should resume.
 */
function sweep(
	samples: readonly NibSample[],
	from: number,
): { d: string; next: number } {
	if (samples.length === 0) return { d: "", next: 0 };
	if (samples.length === 1) return { d: nibDab(samples[0]), next: 1 };

	const corners: Vec[] = new Array(8);
	let d = "";
	let start = Math.max(0, from);
	if (start >= samples.length - 1) return { d: "", next: start };

	while (start < samples.length - 1) {
		const anchor = samples[start];
		let end = start + 1;
		let dirX = samples[end].x - anchor.x;
		let dirY = samples[end].y - anchor.y;
		const dirLength = Math.hypot(dirX, dirY) || 1;
		dirX /= dirLength;
		dirY /= dirLength;

		// Extend while the path stays straight enough that the hull of the two end
		// footprints still covers everything in between.
		while (end + 1 < samples.length) {
			const candidate = samples[end + 1];
			let nx = candidate.x - samples[end].x;
			let ny = candidate.y - samples[end].y;
			const length = Math.hypot(nx, ny);
			if (length < 1e-6) {
				end++;
				continue;
			}
			nx /= length;
			ny /= length;
			const turn = Math.abs(
				Math.acos(Math.max(-1, Math.min(1, dirX * nx + dirY * ny))),
			);
			if (turn > MERGE_ANGLE_TOLERANCE) break;
			if (
				Math.abs(candidate.half - anchor.half) / anchor.half >
					MERGE_LOAD_TOLERANCE ||
				Math.abs(candidate.thick - anchor.thick) / anchor.thick >
					MERGE_LOAD_TOLERANCE
			)
				break;
			end++;
		}

		nibCorners(anchor, corners, 0);
		nibCorners(samples[end], corners, 4);
		d += subpath(hull(corners));
		start = end;
	}
	return { d, next: start };
}

/**
 * Full stroke geometry. Deterministic: the same trace rebuilds the same ink on
 * every device, which is what lets the wire format carry points instead of
 * path data.
 *
 * `seed` is accepted and ignored — the nib is a rigid tool and randomness was
 * what made the old edges look sloppy rather than inked. Kept in the signature
 * (and on the stroke) so drawings saved with it still load.
 */
export function buildCalligraphyPathString(
	rawPoints: readonly RawPoint[],
	_seed: number,
	baseWidth: number,
): string {
	const samples = buildNibSamples(rawPoints, baseWidth);
	if (samples.length === 0) return "";
	if (samples.length === 1) return nibDab(samples[0]);
	return sweep(samples, 0).d;
}

function inflateTrace(compressed: number[]): RawPoint[] {
	const out: RawPoint[] = [];
	let lastX = 0;
	let lastY = 0;
	let lastTime = 0;
	for (let i = 0; i + 2 < compressed.length; i += 3) {
		let ix = compressed[i];
		let iy = compressed[i + 1];
		let it = compressed[i + 2];
		if (i > 0) {
			ix += lastX;
			iy += lastY;
			it += lastTime;
		}
		lastX = ix;
		lastY = iy;
		lastTime = it;
		out.push({ x: ix / 10, y: iy / 10, time: it });
	}
	return out;
}

// ------------------------------------------------------------------
// THE BRUSH
// ------------------------------------------------------------------

// @ts-expect-error fabric's BaseBrush types the handlers loosely
export class CalligraphyBrush extends BaseBrush {
	override width = 40;
	private _rawPoints: RawPoint[] = [];
	private _isDrawing = false;

	/** Sweeps already drawn into `_settled`, so they are never rebuilt. */
	private _settled: Path2D | null = null;
	/** Raw points whose sweeps are already inside `_settled`. */
	private _settledRawCount = 0;

	onMouseDown(pointer: Point) {
		this._isDrawing = true;
		this._rawPoints = [{ x: pointer.x, y: pointer.y, time: Date.now() }];
		this._settled = null;
		this._settledRawCount = 0;
		this.canvas.clearContext(this.canvas.contextTop);
	}

	onMouseMove(pointer: Point) {
		if (!this._isDrawing || this._rawPoints.length === 0) return;

		const last = this._rawPoints[this._rawPoints.length - 1];
		// The centreline is resampled and smoothed downstream, so capturing every
		// tremor buys nothing but samples.
		if (Math.hypot(pointer.x - last.x, pointer.y - last.y) <= 2) return;

		this._rawPoints.push({ x: pointer.x, y: pointer.y, time: Date.now() });
		this._drawTemporaryStroke();
	}

	onMouseUp() {
		if (!this._isDrawing) return false;
		this._isDrawing = false;
		this.canvas.clearContext(this.canvas.contextTop);

		const points = this._rawPoints;
		this._rawPoints = [];
		this._settled = null;
		if (points.length === 0) return false;

		const d = buildCalligraphyPathString(points, 0, this.width);
		if (!d) return false;

		const stroke = new CalligraphyStroke(d, {
			fill: this.color,
			// No outline: the ink is a UNION of convex subpaths, so stroking it
			// would trace every internal sweep boundary straight through the solid.
			stroke: "",
			strokeWidth: 0,
			fillRule: "nonzero",
			interactive: false,
			baseWidth: this.width,
			rawPoints: points,
		});

		this.canvas.add(stroke);
		this.canvas.fire("path:created", { path: stroke });
		return false;
	}

	/**
	 * Live preview.
	 *
	 * Incremental in WINDOWS. Everything older than the last two raw points is
	 * final (Catmull-Rom needs a point of lookahead, and the merger needs to see
	 * the next direction), so once a chunk of it has accumulated its sweeps are
	 * built from a LOCAL window and appended to a retained Path2D. The window is
	 * what makes this O(1) per pointer move: rebuilding the whole prefix each
	 * time would still be quadratic over a stroke, just with a smaller constant.
	 *
	 * Windows overlap by a raw point at each edge. Overlapping sweeps cost
	 * nothing — the ink is a nonzero union — while a gap would be a visible
	 * notch, so the overlap is deliberate.
	 */
	private _drawTemporaryStroke() {
		const ctx = this.canvas.contextTop;
		this.canvas.clearContext(ctx);

		const points = this._rawPoints;
		const settleTo = Math.max(0, points.length - 2);
		if (settleTo - this._settledRawCount >= SETTLE_CHUNK) {
			const from = Math.max(0, this._settledRawCount - 1);
			const d = sweep(
				buildNibSamples(points.slice(from, settleTo), this.width),
				0,
			).d;
			if (d) {
				const addition = new Path2D(d);
				if (this._settled) this._settled.addPath(addition);
				else this._settled = addition;
				this._settledRawCount = settleTo;
			}
		}

		const tail = buildNibSamples(
			points.slice(Math.max(0, this._settledRawCount - 1)),
			this.width,
		);
		const tailPath = tail.length ? sweep(tail, 0).d || nibDab(tail[0]) : "";

		ctx.save();
		const vpt = this.canvas.viewportTransform;
		if (vpt) ctx.transform(vpt[0], vpt[1], vpt[2], vpt[3], vpt[4], vpt[5]);
		ctx.fillStyle = this.color as string;
		if (this._settled) ctx.fill(this._settled, "nonzero");
		if (tailPath) ctx.fill(new Path2D(tailPath), "nonzero");
		ctx.restore();
	}
}

// ------------------------------------------------------------------
// THE STROKE
// ------------------------------------------------------------------

export class CalligraphyStroke extends Path {
	static override type = "CalligraphyStroke";
	static override cacheProperties = [
		...Path.cacheProperties,
		"seed",
		"baseWidth",
		"compressedTrace",
	];

	/** Retained only so drawings saved by the old brush round-trip unchanged. */
	public seed = 0;
	public baseWidth = 40;
	public rawPoints: RawPoint[] = [];

	constructor(path: string | any[], options: any) {
		super(path, options);
		this.seed = options.seed ?? 0;
		this.baseWidth = options.baseWidth ?? 40;
		this.rawPoints = options.compressedTrace
			? inflateTrace(options.compressedTrace)
			: (options.rawPoints ?? []);
	}

	// @ts-expect-error fabric types toObject as taking no arguments
	toObject(additionalProperties: string[] = []) {
		// Ship only the delta-encoded trace (x, y, time). The geometry is rebuilt
		// deterministically on the other side.
		const flatTrace: number[] = [];
		let lastX = 0;
		let lastY = 0;
		let lastTime = 0;
		for (let i = 0; i < this.rawPoints.length; i++) {
			const point = this.rawPoints[i];
			const ix = Math.round(point.x * 10);
			const iy = Math.round(point.y * 10);
			const it = point.time;
			if (i === 0) flatTrace.push(ix, iy, it);
			else flatTrace.push(ix - lastX, iy - lastY, it - lastTime);
			lastX = ix;
			lastY = iy;
			lastTime = it;
		}

		// Path.toObject deep-copies every segment and it is discarded — fromObject
		// rebuilds from `compressedTrace`. See toObjectWithoutPath.
		const baseObj = toObjectWithoutPath(this, (p) => super.toObject(p as any), [
			"seed",
			"baseWidth",
			...additionalProperties,
		]);

		return { ...baseObj, compressedTrace: flatTrace };
	}

	static override async fromObject(object: any) {
		let path = object.path;
		if (!path || (Array.isArray(path) && path.length === 0)) {
			const points = inflateTrace(object.compressedTrace || []);
			path = buildCalligraphyPathString(points, 0, object.baseWidth);
		}
		const enlivened = await enlivenStrokeProps(object);
		// Drawings saved by the previous brush carry a dark "capillary edge"
		// stroke. That outline was drawn around a single self-crossing polygon;
		// against the union-of-subpaths geometry it would trace every internal
		// sweep boundary straight through the ink, so it is dropped on the way in.
		return new CalligraphyStroke(path, {
			...enlivened,
			stroke: "",
			strokeWidth: 0,
			fillRule: "nonzero",
		});
	}
}
