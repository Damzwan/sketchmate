import { BaseBrush, Canvas, Path, Point } from "fabric";
import { enlivenStrokeProps, toObjectWithoutPath } from "@/draw/utils/brushes/brush.helpers";

// ------------------------------------------------------------------
// 1. DETERMINISTIC UTILITIES
// ------------------------------------------------------------------

export function seededRandom(seed: number) {
	return function () {
		let t = (seed += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface RawPoint {
	x: number;
	y: number;
	time: number;
}

// ------------------------------------------------------------------
// 2. THE BRUSH CONTROLLER
// ------------------------------------------------------------------

// @ts-ignore
export class CalligraphyBrush extends BaseBrush {
	width = 40;
	private _rawPoints: RawPoint[] = [];
	private _seed: number = 0;

	// Explicit drawing state prevents the "menu switch ghost stroke" bug.
	private _isDrawing: boolean = false;

	constructor(canvas: Canvas) {
		super(canvas);
	}

	onMouseDown(pointer: Point) {
		this._isDrawing = true;
		this._seed = Math.floor(Math.random() * 1000000);
		this._rawPoints = [{ x: pointer.x, y: pointer.y, time: Date.now() }];
		this.canvas.clearContext(this.canvas.contextTop);
	}

	onMouseMove(pointer: Point) {
		// Strict guardrail: only draw once a stroke has explicitly started.
		if (!this._isDrawing || !this._rawPoints || this._rawPoints.length === 0)
			return;

		const lastPt = this._rawPoints[this._rawPoints.length - 1];
		const dx = pointer.x - lastPt.x;
		const dy = pointer.y - lastPt.y;

		// Small interpolation buffer.
		if (Math.sqrt(dx * dx + dy * dy) > 2) {
			this._rawPoints.push({ x: pointer.x, y: pointer.y, time: Date.now() });
			this._drawTemporaryStroke();
		}
	}

	onMouseUp() {
		if (!this._isDrawing) return false;
		this._isDrawing = false;
		this.canvas.clearContext(this.canvas.contextTop);

		const pts = this._rawPoints;
		// length 1 (a quick tap) is valid — it stamps a single nib footprint.
		if (pts && pts.length >= 1) {
			const pathStr = buildCalligraphyPathString(pts, this._seed, this.width);
			if (pathStr) {
				const base = parseColor(this.color as string);
				const stroke = new CalligraphyStroke(pathStr, {
					fill: this.color,
					// Dark capillary edge = inked depth, not a flat cutout.
					stroke: rgba(mix(base, 0, 0, 0, 0.5), base.a * 0.55),
					strokeWidth: Math.max(0.6, this.width * 0.05),
					strokeLineJoin: "round",
					strokeLineCap: "round",
					fillRule: "nonzero",
					interactive: false,
					seed: this._seed,
					baseWidth: this.width,
					rawPoints: [...pts],
				});

				this.canvas.add(stroke);
				this.canvas.fire("path:created", { path: stroke });
			}
		}
		this._rawPoints = [];
		return false;
	}

	// Live preview: paint the exact SAME vector geometry the committed stroke
	// uses (via Path2D), so what you see while dragging is what you get. Cheap —
	// one fill + one thin edge stroke, no per-frame raster.
	private _drawTemporaryStroke() {
		const ctx = this.canvas.contextTop;
		this.canvas.clearContext(ctx);

		const pathStr = buildCalligraphyPathString(
			this._rawPoints,
			this._seed,
			this.width,
		);
		if (!pathStr) return;

		ctx.save();
		if (this.canvas.viewportTransform) {
			const v = this.canvas.viewportTransform;
			ctx.transform(v[0], v[1], v[2], v[3], v[4], v[5]);
		}

		const p2d = new Path2D(pathStr);
		const base = parseColor(this.color as string);
		ctx.fillStyle = this.color as string;
		ctx.fill(p2d);
		ctx.strokeStyle = rgba(mix(base, 0, 0, 0, 0.5), base.a * 0.55);
		ctx.lineWidth = Math.max(0.6, this.width * 0.05);
		ctx.lineJoin = "round";
		ctx.lineCap = "round";
		ctx.stroke(p2d);
		ctx.restore();
	}
}

// ------------------------------------------------------------------
// 3. COLOR + GEOMETRY HELPERS (self-contained, no external deps)
// ------------------------------------------------------------------

interface RGBA {
	r: number;
	g: number;
	b: number;
	a: number;
}

// Parses #rgb / #rrggbb / #rrggbbaa / rgb() / rgba(). The pen feeds an 8-digit
// hex (colour + opacity), so alpha must survive.
function parseColor(input: string): RGBA {
	const s = (input || "#000000").trim();
	if (s[0] === "#") {
		let hex = s.slice(1);
		if (hex.length === 3)
			hex = hex
				.split("")
				.map((c) => c + c)
				.join("");
		if (hex.length === 6) hex += "ff";
		const n = parseInt(hex, 16) >>> 0;
		return {
			r: (n >>> 24) & 255,
			g: (n >>> 16) & 255,
			b: (n >>> 8) & 255,
			a: (n & 255) / 255,
		};
	}
	const m = s.match(/rgba?\(([^)]+)\)/i);
	if (m) {
		const p = m[1].split(",").map((v) => parseFloat(v));
		return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p[3] ?? 1 };
	}
	return { r: 0, g: 0, b: 0, a: 1 };
}

function mix(c: RGBA, tr: number, tg: number, tb: number, amt: number): RGBA {
	return {
		r: c.r + (tr - c.r) * amt,
		g: c.g + (tg - c.g) * amt,
		b: c.b + (tb - c.b) * amt,
		a: c.a,
	};
}

const rgba = (c: RGBA, a: number) =>
	`rgba(${c.r | 0},${c.g | 0},${c.b | 0},${a})`;

function smoothstep(edge0: number, edge1: number, x: number): number {
	if (edge1 <= edge0) return x < edge0 ? 0 : 1;
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

interface NibSample {
	x: number;
	y: number;
	press: number; // 0..1 nib load
}

// Catmull-Rom resample of the raw trace into a dense, evenly-spaced centreline
// carrying a velocity-derived load. Smooth centreline = glassy edges; the
// committed stroke is a VECTOR path (below), so it stays razor-crisp at any
// stroke width or zoom — no raster blur.
function buildCenterline(rawPoints: RawPoint[], baseWidth: number): NibSample[] {
	const pts: NibSample[] = [];
	for (let i = 0; i < rawPoints.length; i++) {
		const p = rawPoints[i];
		if (i > 0) {
			const prev = rawPoints[i - 1];
			if (Math.hypot(p.x - prev.x, p.y - prev.y) < 0.01) continue;
			const dt = Math.max(1, p.time - prev.time);
			const v = Math.hypot(p.x - prev.x, p.y - prev.y) / dt; // px/ms
			// Rigid broad nib: load barely varies with speed (real dip pens don't).
			// Thick↔thin comes from stroke DIRECTION vs the nib, which is what
			// reads as authentic calligraphy. Speed only trims the swell slightly.
			const load = 0.8 + 0.2 * Math.max(0, Math.min(1, 1 - v / 3));
			pts.push({ x: p.x, y: p.y, press: load });
		} else {
			pts.push({ x: p.x, y: p.y, press: 0.9 });
		}
	}
	if (pts.length < 2) return pts;

	// EMA-smooth load both directions so swells read as fluid.
	for (let i = 1; i < pts.length; i++)
		pts[i].press = pts[i].press * 0.4 + pts[i - 1].press * 0.6;
	for (let i = pts.length - 2; i >= 0; i--)
		pts[i].press = pts[i].press * 0.4 + pts[i + 1].press * 0.6;

	const spacing = Math.max(1, Math.min(2.5, baseWidth * 0.08));
	const out: NibSample[] = [];
	const P = (i: number) => pts[Math.max(0, Math.min(pts.length - 1, i))];

	for (let i = 0; i < pts.length - 1; i++) {
		const p0 = P(i - 1);
		const p1 = P(i);
		const p2 = P(i + 1);
		const p3 = P(i + 2);
		const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
		const steps = Math.max(1, Math.ceil(segLen / spacing));
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
			out.push({ x, y, press: p1.press + (p2.press - p1.press) * t });
		}
	}
	out.push({ ...pts[pts.length - 1] });
	return out;
}

// ------------------------------------------------------------------
// 4. THE INK ENGINE — flat broad nib, emitted as a VECTOR outline
// ------------------------------------------------------------------

const NIB_ANGLE = -Math.PI / 4; // classic broad-nib italic tilt

// The two nib edges: each centreline point offset ±half along the FIXED nib
// axis. Because the offset axis is fixed, moving along the nib collapses the
// ribbon to a hairline while moving across it opens to full width — authentic
// calligraphic contrast. Tapered terminals mimic a lifted pen.
function buildCalligraphyEdges(
	rawPoints: RawPoint[],
	seed: number,
	baseWidth: number,
): { left: { x: number; y: number }[]; right: { x: number; y: number }[] } | null {
	const samples = buildCenterline(rawPoints, baseWidth);
	if (samples.length < 2) return null;

	const ex = Math.cos(NIB_ANGLE);
	const ey = Math.sin(NIB_ANGLE);

	let total = 0;
	const cum = new Array(samples.length).fill(0);
	for (let i = 1; i < samples.length; i++) {
		total += Math.hypot(
			samples[i].x - samples[i - 1].x,
			samples[i].y - samples[i - 1].y,
		);
		cum[i] = total;
	}
	const taper = Math.min(baseWidth * 0.9, total * 0.4);
	const random = seededRandom(seed);

	const left: { x: number; y: number }[] = [];
	const right: { x: number; y: number }[] = [];
	for (let i = 0; i < samples.length; i++) {
		const s = samples[i];
		const tip = Math.min(
			smoothstep(0, taper, cum[i]),
			smoothstep(0, taper, total - cum[i]),
		);
		// Whisper of deterministic edge wobble = organic ink, sub-pixel, no blur.
		const jitter = (random() - 0.5) * 0.4;
		const half = Math.max(0.3, (baseWidth / 2) * s.press * tip + jitter);
		left.push({ x: s.x + ex * half, y: s.y + ey * half });
		right.push({ x: s.x - ex * half, y: s.y - ey * half });
	}
	return { left, right };
}

// A single nib footprint for a tap (no travel): the flat nib pressed once — a
// short, thick diagonal at the nib angle. Deterministic, so a tap syncs and
// rebuilds identically on every device.
function nibDabPath(p: RawPoint, baseWidth: number): string {
	const ex = Math.cos(NIB_ANGLE); // along the nib
	const ey = Math.sin(NIB_ANGLE);
	const px = -ey; // across the nib (its thickness)
	const py = ex;
	const L = Math.max(1, baseWidth * 0.55);
	const T = Math.max(0.5, baseWidth * 0.16);
	const c = [
		[p.x + ex * L + px * T, p.y + ey * L + py * T],
		[p.x - ex * L + px * T, p.y - ey * L + py * T],
		[p.x - ex * L - px * T, p.y - ey * L - py * T],
		[p.x + ex * L - px * T, p.y + ey * L - py * T],
	];
	return (
		`M ${c[0][0].toFixed(2)} ${c[0][1].toFixed(2)} ` +
		`L ${c[1][0].toFixed(2)} ${c[1][1].toFixed(2)} ` +
		`L ${c[2][0].toFixed(2)} ${c[2][1].toFixed(2)} ` +
		`L ${c[3][0].toFixed(2)} ${c[3][1].toFixed(2)} Z`
	);
}

// Full ribbon outline as an SVG path (down one edge, back the other, closed).
// nonzero fill unions any self-overlap at sharp turns, so no interior holes.
export function buildCalligraphyPathString(
	rawPoints: RawPoint[],
	seed: number,
	baseWidth: number,
): string {
	if (!rawPoints || rawPoints.length === 0) return "";
	if (rawPoints.length < 2) return nibDabPath(rawPoints[0], baseWidth);

	const edges = buildCalligraphyEdges(rawPoints, seed, baseWidth);
	if (!edges) return nibDabPath(rawPoints[0], baseWidth);

	const { left, right } = edges;
	let d = `M ${left[0].x.toFixed(2)} ${left[0].y.toFixed(2)} `;
	for (let i = 1; i < left.length; i++)
		d += `L ${left[i].x.toFixed(2)} ${left[i].y.toFixed(2)} `;
	for (let i = right.length - 1; i >= 0; i--)
		d += `L ${right[i].x.toFixed(2)} ${right[i].y.toFixed(2)} `;
	d += "Z";
	return d;
}

function inflateTrace(compressed: number[]): RawPoint[] {
	const out: RawPoint[] = [];
	let lastX = 0,
		lastY = 0,
		lastTime = 0;
	for (let i = 0; i < compressed.length; i += 3) {
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
// 5. THE STROKE — a real vector Path (crisp everywhere, sync-friendly)
// ------------------------------------------------------------------
export class CalligraphyStroke extends Path {
	static type = "CalligraphyStroke";
	static cacheProperties = [
		...Path.cacheProperties,
		"seed",
		"baseWidth",
		"compressedTrace",
	];

	public seed: number = 0;
	public baseWidth: number = 40;
	public rawPoints: RawPoint[] = [];

	constructor(path: string | any[], options: any) {
		super(path, options);
		this.seed = options.seed ?? 0;
		this.baseWidth = options.baseWidth ?? 40;
		if (options.compressedTrace) {
			this.rawPoints = inflateTrace(options.compressedTrace);
		} else {
			this.rawPoints = options.rawPoints || [];
		}
	}

	// @ts-ignore
	toObject(additionalProperties: string[] = []) {
		// Ship only the delta-encoded raw trace (x, y, time). The heavy `path`
		// geometry is regenerated deterministically on the other side.
		const flatTrace: number[] = [];
		let lastX = 0,
			lastY = 0,
			lastTime = 0;
		for (let i = 0; i < this.rawPoints.length; i++) {
			const p = this.rawPoints[i];
			const ix = Math.round(p.x * 10);
			const iy = Math.round(p.y * 10);
			const it = p.time;
			if (i === 0) {
				flatTrace.push(ix, iy, it);
			} else {
				flatTrace.push(ix - lastX, iy - lastY, it - lastTime);
			}
			lastX = ix;
			lastY = iy;
			lastTime = it;
		}

		// Path.toObject deep-copies every segment and it is discarded —
		// fromObject rebuilds from `compressedTrace`. See toObjectWithoutPath.
		const baseObj = toObjectWithoutPath(this, (p) => super.toObject(p as any), [
			"seed",
			"baseWidth",
			...additionalProperties,
		]);

		return {
			...baseObj,
			compressedTrace: flatTrace,
		};
	}

	static async fromObject(object: any) {
		let path = object.path;
		if (!path || (Array.isArray(path) && path.length === 0)) {
			const pts = inflateTrace(object.compressedTrace || []);
			path = buildCalligraphyPathString(pts, object.seed, object.baseWidth);
		}
		const enlivened = await enlivenStrokeProps(object);
		return new CalligraphyStroke(path, enlivened);
	}
}
