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
	let totalDistance = 0;

	for (let i = 0; i < basePoints.length; i++) {
		const point = basePoints[i];
		let distance = 0;
		if (i > 0) {
			const previous = basePoints[i - 1];
			distance = Math.hypot(point.x - previous.x, point.y - previous.y);
			totalDistance += distance;
		}
		const speedFactor = Math.min(1, distance / 20);
		const spreadMultiplier = 1.2 - speedFactor * 0.7;

		for (let bristle = 0; bristle < 3; bristle++) {
			const wave =
				Math.sin(totalDistance * 0.05 + bristle) *
				(safeWidth * 0.15 * spreadMultiplier);
			const { nx, ny } = deterministicWatercolorNoise(
				point.x,
				point.y,
				bristle,
			);
			bristles[bristle][i * 2] =
				point.x + wave + nx * (safeWidth * 0.2 * spreadMultiplier);
			bristles[bristle][i * 2 + 1] =
				point.y + wave + ny * (safeWidth * 0.2 * spreadMultiplier);
		}
	}
	return bristles;
}

/**
 * Douglas-Peucker tolerance for the base points, in world units.
 *
 * The brush captures at `decimate = 0.3`, so a stroke is sampled several times
 * per pixel — a 250px stroke is ~830 points, and each one becomes THREE path
 * commands (one per bristle). Simplifying to 0.3 leaves ~28 points; the wobble
 * that makes the brush look like watercolour comes from the deterministic noise
 * applied per point, not from the sampling density, so the character survives.
 *
 * 0.3 is exactly what CustomPencilBrush already ships. Scaling gently with
 * width lets a wide wash drop more, since a 40px stroke cannot show a
 * third-of-a-pixel deviation.
 */
export function watercolorSimplifyTolerance(width: number): number {
	const safeWidth = Number.isFinite(width) && width > 0 ? width : 10;
	return Math.max(0.3, safeWidth * 0.02);
}

/**
 * Drop points that contribute no visible shape. Pure geometry, no allocation
 * beyond the result, and identical in spirit to the pencil's commit-time pass.
 */
export function simplifyWatercolorPoints(
	points: readonly WatercolorPoint[],
	tolerance: number,
): WatercolorPoint[] {
	const count = points.length;
	if (count <= 2 || !(tolerance > 0)) return points.slice();

	const squareTolerance = tolerance * tolerance;
	const keep = new Uint8Array(count);
	keep[0] = 1;
	keep[count - 1] = 1;

	// Iterative, not recursive: a dense stroke is thousands of points and a
	// recursive split would risk the stack on the very inputs this exists for.
	const stack: number[] = [0, count - 1];
	while (stack.length) {
		const end = stack.pop() as number;
		const start = stack.pop() as number;
		let furthest = -1;
		let furthestDistance = 0;
		for (let i = start + 1; i < end; i++) {
			const distance = squareSegmentDistance(
				points[i],
				points[start],
				points[end],
			);
			if (distance > furthestDistance) {
				furthestDistance = distance;
				furthest = i;
			}
		}
		if (furthestDistance > squareTolerance && furthest > 0) {
			keep[furthest] = 1;
			stack.push(start, furthest, furthest, end);
		}
	}

	const out: WatercolorPoint[] = [];
	for (let i = 0; i < count; i++) if (keep[i]) out.push(points[i]);
	return out;
}

function squareSegmentDistance(
	point: WatercolorPoint,
	start: WatercolorPoint,
	end: WatercolorPoint,
): number {
	let x = start.x;
	let y = start.y;
	let dx = end.x - x;
	let dy = end.y - y;
	if (dx !== 0 || dy !== 0) {
		const t = ((point.x - x) * dx + (point.y - y) * dy) / (dx * dx + dy * dy);
		if (t > 1) {
			x = end.x;
			y = end.y;
		} else if (t > 0) {
			x += dx * t;
			y += dy * t;
		}
	}
	dx = point.x - x;
	dy = point.y - y;
	return dx * dx + dy * dy;
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
