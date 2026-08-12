export interface WatercolorPoint {
	x: number;
	y: number;
}

export type WatercolorPathCommand =
	| ["M", number, number]
	| ["L", number, number]
	| ["Q", number, number, number, number];

export interface WatercolorRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface WatercolorPathContext {
	beginPath(): void;
	moveTo(x: number, y: number): void;
	lineTo(x: number, y: number): void;
	quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
}

const NOISE_GRID = 10;

/**
 * The in-memory trace type.
 *
 * Float32Array, not `number[]`: V8 stores a plain array of numbers as 8 bytes
 * per slot plus array overhead, so a 1,000-number trace is ~8 KB — and
 * watercolour is the most numerous object on a real canvas. Float32 halves
 * that and is EXACT here, because every value is an integer (coordinates are
 * fixed-point ×10) far below the 2^24 limit where float32 stops representing
 * integers exactly. Int16 would halve it again but overflows: the first pair is
 * an ABSOLUTE coordinate ×10, which passes 32767 on a large canvas.
 *
 * The WIRE stays `number[]` — a typed array JSON-serializes to `{"0":…}` and
 * would be unreadable to every peer and every saved drawing.
 */
export type WatercolorTrace = Float32Array;

export function encodeWatercolorTrace(
	points: readonly WatercolorPoint[],
): WatercolorTrace {
	const trace = new Float32Array(points.length * 2);
	let lastX = 0;
	let lastY = 0;
	for (let i = 0; i < points.length; i++) {
		const ix = Math.round(points[i].x * 10);
		const iy = Math.round(points[i].y * 10);
		trace[i * 2] = i === 0 ? ix : ix - lastX;
		trace[i * 2 + 1] = i === 0 ? iy : iy - lastY;
		lastX = ix;
		lastY = iy;
	}
	return trace;
}

/** Accepts either representation — saved drawings carry the array form. */
export function toWatercolorTrace(source: unknown): WatercolorTrace | null {
	if (source instanceof Float32Array) return source;
	if (!Array.isArray(source)) return null;
	const out = new Float32Array(source.length);
	for (let i = 0; i < source.length; i++) {
		const value = Number(source[i]);
		out[i] = Number.isFinite(value) ? value : 0;
	}
	return out;
}

/** Back to the wire/disk representation. */
export function watercolorTraceToJSON(trace: WatercolorTrace): number[] {
	const out = new Array<number>(trace.length);
	for (let i = 0; i < trace.length; i++) out[i] = trace[i];
	return out;
}

export function deterministicWatercolorNoise(
	x: number,
	y: number,
	bristle: number,
): { nx: number; ny: number } {
	const qx = Math.round(x * NOISE_GRID) / NOISE_GRID;
	const qy = Math.round(y * NOISE_GRID) / NOISE_GRID;
	const seedX = qx * 12.9898 + qy * 78.233 + bristle * 13.5;
	const seedY = qx * 78.233 + qy * 12.9898 + bristle * 31.7;
	return {
		nx: (Math.abs(Math.sin(seedX) * 43758.5453) % 1) - 0.5,
		ny: (Math.abs(Math.sin(seedY) * 43758.5453) % 1) - 0.5,
	};
}

export function decodeWatercolorTrace(trace: unknown): WatercolorPoint[] {
	if (trace instanceof Float32Array) {
		const out: WatercolorPoint[] = [];
		let lastX = 0;
		let lastY = 0;
		for (let i = 0; i + 1 < trace.length; i += 2) {
			const ix = i > 0 ? trace[i] + lastX : trace[i];
			const iy = i > 0 ? trace[i + 1] + lastY : trace[i + 1];
			lastX = ix;
			lastY = iy;
			out.push({ x: ix / 10, y: iy / 10 });
		}
		return out;
	}
	if (!Array.isArray(trace)) return [];
	const out: WatercolorPoint[] = [];
	let lastX = 0;
	let lastY = 0;
	for (let i = 0; i + 1 < trace.length; i += 2) {
		let ix = Number(trace[i]);
		let iy = Number(trace[i + 1]);
		if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
		if (i > 0) {
			ix += lastX;
			iy += lastY;
		}
		lastX = ix;
		lastY = iy;
		out.push({ x: ix / 10, y: iy / 10 });
	}
	return out;
}

export function normalizeWatercolorPoints(points: unknown): WatercolorPoint[] {
	if (!Array.isArray(points)) return [];
	const out: WatercolorPoint[] = [];
	for (const point of points) {
		const x = Number((point as any)?.x);
		const y = Number((point as any)?.y);
		if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y });
	}
	return out;
}

/**
 * Bristle offsets for one stroke — DENSITY-INVARIANT by construction.
 *
 * This used to derive both the wave phase and its amplitude from the point
 * SPACING: phase from the running polyline length, amplitude from the length of
 * the previous segment (a stand-in for speed). Both change when points are
 * added or dropped, so every re-fit of the stroke slid the whole downstream
 * wave and pulsed its amplitude — half of the "it keeps moving, I have no
 * control" feeling. (The other half was the re-fitting itself; see
 * `watercolorSampleSpacing`.)
 *
 * Everything here now depends only on WHERE a point is, never on how many
 * neighbours it has. Wave and spread are plane waves in world space — the brush
 * samples a fixed ripple field rather than carrying a phase along the stroke.
 * Arc length was tried first and is nearly invariant, but not exactly: dropping
 * the sub-pixel tremor shortens the polyline, so the phase drifted a little
 * further with every dropped point (~0.6px by the end of a 250px stroke, and it
 * grows with length). A spatial field has no accumulator to drift.
 *
 * A point that survives thinning therefore lands EXACTLY where it did before,
 * which is what makes thinning a stored legacy trace safe. It also gives washes
 * laid side by side a shared grain, which reads as paper.
 */
/** ~150px ripple period across the diagonal — a brush-width-agnostic grain. */
const WAVE_FX = 0.035;
const WAVE_FY = 0.021;
/** Much slower field for the loaded/dry breathing, so the two never beat. */
const SPREAD_FX = 0.009;
const SPREAD_FY = 0.006;
export function buildWatercolorBristles(
	basePoints: readonly WatercolorPoint[],
	width: number,
): Float32Array[] {
	const safeWidth = Number.isFinite(width) && width > 0 ? width : 10;
	const bristles = [
		new Float32Array(basePoints.length * 2),
		new Float32Array(basePoints.length * 2),
		new Float32Array(basePoints.length * 2),
	];
	for (let i = 0; i < basePoints.length; i++) {
		const point = basePoints[i];
		// 0.85–1.15: the loaded/dry breathing of a real brush.
		const spreadMultiplier =
			1 + Math.sin(point.x * SPREAD_FX + point.y * SPREAD_FY) * 0.15;
		const waveAmplitude = safeWidth * 0.15 * spreadMultiplier;
		const scatter = safeWidth * 0.2 * spreadMultiplier;
		const phase = point.x * WAVE_FX + point.y * WAVE_FY;

		for (let bristle = 0; bristle < 3; bristle++) {
			const wave = Math.sin(phase + bristle) * waveAmplitude;
			const { nx, ny } = deterministicWatercolorNoise(
				point.x,
				point.y,
				bristle,
			);
			bristles[bristle][i * 2] = point.x + wave + nx * scatter;
			bristles[bristle][i * 2 + 1] = point.y + wave + ny * scatter;
		}
	}
	return bristles;
}

/**
 * How far the pointer must travel before the brush takes another sample.
 *
 * This is the ONLY thinning a watercolour stroke gets, and it happens at INPUT
 * time — before any geometry exists — which is what makes the drawn ribbon
 * append-only and therefore stable.
 *
 * Douglas-Peucker used to do this job and cannot, at any tolerance. DP measures
 * deviation on the CENTERLINE, but what is drawn is the centerline plus a
 * per-point wave and a per-point positional noise: two neighbouring samples can
 * sit 0.4px apart on the centerline and several pixels apart on the ribbon.
 * Dropping the sample between them therefore deletes a wiggle DP believes is
 * invisible — which is why the stroke kept re-shaping behind the finger every
 * time a chunk was frozen mid-stroke.
 *
 * Scaled by width because the wiggle is too: a 40px wash cannot show detail a
 * 4px line can. The floor keeps thin strokes honest, the ceiling stops a very
 * wide wash from turning into a polygon.
 */
export function watercolorSampleSpacing(width: number): number {
	const safeWidth = Number.isFinite(width) && width > 0 ? width : 10;
	return Math.min(6, Math.max(1.5, safeWidth * 0.12));
}

/**
 * Thin a stored trace that was captured at the OLD sub-pixel sampling rate.
 *
 * Drawings made before input decimation carry a sample every 0.3px — a 250px
 * stroke is ~830 points at three path commands each. They still have to load
 * without turning into 2,500 commands, and re-shaping a stroke nobody is
 * currently drawing is harmless. Traces already at (or near) the target spacing
 * are returned UNTOUCHED, so anything drawn by the current brush rebuilds
 * exactly as it was drawn — the distinction DP could not make.
 */
export function thinLegacyWatercolorTrace(
	points: readonly WatercolorPoint[],
	spacing: number,
): WatercolorPoint[] {
	if (points.length < 3 || !(spacing > 0)) return points.slice();

	let travelled = 0;
	for (let i = 1; i < points.length; i++) {
		travelled += Math.hypot(
			points[i].x - points[i - 1].x,
			points[i].y - points[i - 1].y,
		);
	}
	// Already sampled at least this coarsely → not a legacy trace, leave it be.
	if (travelled / (points.length - 1) >= spacing * 0.6) return points.slice();

	const out: WatercolorPoint[] = [points[0]];
	let sinceKept = 0;
	for (let i = 1; i < points.length - 1; i++) {
		sinceKept += Math.hypot(
			points[i].x - points[i - 1].x,
			points[i].y - points[i - 1].y,
		);
		if (sinceKept < spacing) continue;
		out.push(points[i]);
		sinceKept = 0;
	}
	out.push(points[points.length - 1]);
	return out;
}

export function buildWatercolorPathData(
	basePoints: readonly WatercolorPoint[],
	width: number,
): WatercolorPathCommand[] {
	const commands: WatercolorPathCommand[] = [];
	const round2 = (value: number) => Math.round(value * 100) / 100;
	for (const points of buildWatercolorBristles(basePoints, width)) {
		const count = points.length / 2;
		if (count === 0) continue;
		let x1 = points[0];
		let y1 = points[1];
		commands.push(["M", round2(x1), round2(y1)]);
		for (let i = 1; i < count; i++) {
			const x2 = points[i * 2];
			const y2 = points[i * 2 + 1];
			commands.push([
				"Q",
				round2(x1),
				round2(y1),
				round2((x1 + x2) / 2),
				round2((y1 + y2) / 2),
			]);
			x1 = x2;
			y1 = y2;
		}
		commands.push(["L", round2(x1), round2(y1)]);
	}
	return commands;
}

function segmentHits(
	points: Float32Array,
	index: number,
	rect: WatercolorRect,
	padding: number,
): boolean {
	const x1 = points[(index - 1) * 2];
	const y1 = points[(index - 1) * 2 + 1];
	const x2 = points[index * 2];
	const y2 = points[index * 2 + 1];
	const mx = (x1 + x2) / 2;
	const my = (y1 + y2) / 2;
	const minX = Math.min(x1, x2, mx) - padding;
	const minY = Math.min(y1, y2, my) - padding;
	const maxX = Math.max(x1, x2, mx) + padding;
	const maxY = Math.max(y1, y2, my) + padding;
	return !(
		maxX < rect.x ||
		minX > rect.x + rect.w ||
		maxY < rect.y ||
		minY > rect.y + rect.h
	);
}

/**
 * Trace watercolor geometry into one canvas path.
 *
 * When `clip` is present, only curve runs near that local-space rectangle are
 * emitted. Each run includes a one-segment halo so its artificial round cap is
 * outside the tile clip. All runs still share one beginPath/stroke operation,
 * preserving the original semi-transparent compositing.
 */
export function traceWatercolorPath(
	ctx: WatercolorPathContext,
	bristles: readonly Float32Array[],
	pathOffset: WatercolorPoint,
	clip?: WatercolorRect,
	strokeWidth = 1,
): void {
	ctx.beginPath();
	const ox = pathOffset.x;
	const oy = pathOffset.y;
	const padding = Math.max(2, strokeWidth / 2 + 1);
	// Match the serialized Path geometry exactly: the historic SVG builder
	// rounded source coordinates before Fabric subtracted pathOffset.
	const local = (value: number, offset: number) =>
		Math.round(value * 100) / 100 - offset;

	for (const points of bristles) {
		const count = points.length / 2;
		if (count === 0) continue;
		if (!clip) {
			let x1 = points[0];
			let y1 = points[1];
			ctx.moveTo(local(x1, ox), local(y1, oy));
			for (let i = 1; i < count; i++) {
				const x2 = points[i * 2];
				const y2 = points[i * 2 + 1];
				ctx.quadraticCurveTo(
					local(x1, ox),
					local(y1, oy),
					local((x1 + x2) / 2, ox),
					local((y1 + y2) / 2, oy),
				);
				x1 = x2;
				y1 = y2;
			}
			ctx.lineTo(local(x1, ox), local(y1, oy));
			continue;
		}

		if (count === 1) {
			const x = points[0];
			const y = points[1];
			if (
				x + padding >= clip.x &&
				x - padding <= clip.x + clip.w &&
				y + padding >= clip.y &&
				y - padding <= clip.y + clip.h
			) {
				ctx.moveTo(local(x, ox), local(y, oy));
				ctx.lineTo(local(x, ox), local(y, oy));
			}
			continue;
		}

		let hitStart = -1;
		for (let i = 1; i < count; i++) {
			const hit = segmentHits(points, i, clip, padding);
			if (hit && hitStart < 0) hitStart = i;
			const closesRun = hitStart >= 0 && (!hit || i === count - 1);
			if (!closesRun) continue;

			const hitEnd = hit ? i : i - 1;
			const start = Math.max(1, hitStart - 1);
			const end = Math.min(count - 1, hitEnd + 1);
			let x1 = points[(start - 1) * 2];
			let y1 = points[(start - 1) * 2 + 1];
			ctx.moveTo(local(x1, ox), local(y1, oy));
			for (let j = start; j <= end; j++) {
				const x2 = points[j * 2];
				const y2 = points[j * 2 + 1];
				ctx.quadraticCurveTo(
					local(x1, ox),
					local(y1, oy),
					local((x1 + x2) / 2, ox),
					local((y1 + y2) / 2, oy),
				);
				x1 = x2;
				y1 = y2;
			}
			if (end === count - 1) {
				ctx.lineTo(local(x1, ox), local(y1, oy));
			}
			hitStart = -1;
		}
	}
}

export function watercolorComplexity(source: any): number {
	if (source?.compressedTrace instanceof Float32Array) {
		return Math.max(1, Math.ceil(source.compressedTrace.length * 1.5));
	}
	if (Array.isArray(source?.compressedTrace)) {
		return Math.max(1, Math.ceil(source.compressedTrace.length * 1.5));
	}
	if (Array.isArray(source?.basePoints)) {
		return Math.max(1, source.basePoints.length * 3);
	}
	if (Array.isArray(source?.path)) return Math.max(1, source.path.length);
	if (typeof source?.path === "string")
		return Math.max(1, source.path.length / 12);
	return 1;
}
