export type Point = [number, number];
export type Stroke = { points: Point[]; width: number };

export const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

export function getSqSegDist(point: Point, start: Point, end: Point): number {
	let x = start[0];
	let y = start[1];
	let dx = end[0] - x;
	let dy = end[1] - y;
	if (dx !== 0 || dy !== 0) {
		const position =
			((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
		if (position > 1) {
			x = end[0];
			y = end[1];
		} else if (position > 0) {
			x += dx * position;
			y += dy * position;
		}
	}
	dx = point[0] - x;
	dy = point[1] - y;
	return dx * dx + dy * dy;
}

function simplifyDPStep(
	points: Point[],
	first: number,
	last: number,
	sqTolerance: number,
	simplified: Point[],
): void {
	let maxSqDist = sqTolerance;
	let index = -1;
	for (let cursor = first + 1; cursor < last; cursor++) {
		const sqDist = getSqSegDist(points[cursor], points[first], points[last]);
		if (sqDist > maxSqDist) {
			index = cursor;
			maxSqDist = sqDist;
		}
	}
	if (index < 0) return;
	if (index - first > 1) {
		simplifyDPStep(points, first, index, sqTolerance, simplified);
	}
	simplified.push(points[index]);
	if (last - index > 1) {
		simplifyDPStep(points, index, last, sqTolerance, simplified);
	}
}

export function simplifyPath(points: Point[], tolerance = 0.75): Point[] {
	if (points.length <= 2) return points;
	const sqTolerance = tolerance * tolerance;
	const simplified: Point[] = [points[0]];
	simplifyDPStep(points, 0, points.length - 1, sqTolerance, simplified);
	simplified.push(points[points.length - 1]);
	return simplified;
}

export function buildPath(points: Point[]): string {
	if (points.length === 0) return "";
	if (points.length === 1) {
		const [x, y] = points[0];
		return `M${x},${y} L${x},${y}`;
	}
	const path = [`M${points[0][0]},${points[0][1]}`];
	for (let index = 1; index < points.length - 1; index++) {
		const midX = Number(
			((points[index][0] + points[index + 1][0]) / 2).toFixed(1),
		);
		const midY = Number(
			((points[index][1] + points[index + 1][1]) / 2).toFixed(1),
		);
		path.push(`Q${points[index][0]},${points[index][1]} ${midX},${midY}`);
	}
	const last = points[points.length - 1];
	path.push(`L${last[0]},${last[1]}`);
	return path.join("");
}

function parsePointsFromPath(path: string): Point[] {
	const points: Point[] = [];
	const cleanPath = path.replace(/^\[\d+(?:\.\d+)?\]/, "");
	const command = /([MmLlQq])\s*([^MmLlQqZz]*)/g;
	let match: RegExpExecArray | null;
	while ((match = command.exec(cleanPath)) !== null) {
		const values = match[2]
			.trim()
			.split(/[\s,]+/)
			.filter(Boolean)
			.map(Number);
		const stride = match[1].toLowerCase() === "q" ? 4 : 2;
		for (let index = 0; index < values.length; index += stride) {
			if (values[index] !== undefined && values[index + 1] !== undefined) {
				points.push([values[index], values[index + 1]]);
			}
		}
	}
	return points;
}

export function parsePathToStrokes(path: string): Stroke[] {
	if (!path) return [];
	const strokes: Stroke[] = [];
	if (/\[\d+(?:\.\d+)?\]/.test(path)) {
		for (const segment of path.split(/\s*(?=\[\d)/)) {
			const match = segment.match(/^\[(\d+(?:\.\d+)?)\](.*)$/s);
			if (!match) continue;
			const points = parsePointsFromPath(match[2]);
			if (points.length) {
				strokes.push({ points, width: Number(match[1]) || 6 });
			}
		}
		return strokes;
	}
	const points = parsePointsFromPath(path);
	return points.length ? [{ points, width: 6 }] : [];
}
