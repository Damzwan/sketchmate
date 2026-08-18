export interface InstrumentPoint {
	x: number;
	y: number;
}

export interface RulerGeometry {
	type: "ruler";
	center: InstrumentPoint;
	length: number;
	width: number;
	angle: number;
}

export interface CompassGeometry {
	type: "compass";
	center: InstrumentPoint;
	radius: number;
}

export type InstrumentGeometry = RulerGeometry | CompassGeometry;

export type StrokeConstraint = (point: InstrumentPoint) => InstrumentPoint;

const EPSILON = 1e-6;

function projectToSegment(
	point: InstrumentPoint,
	start: InstrumentPoint,
	end: InstrumentPoint,
): { point: InstrumentPoint; distance: number } {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared <= EPSILON) {
		return {
			point: { ...start },
			distance: Math.hypot(point.x - start.x, point.y - start.y),
		};
	}
	const t = Math.max(
		0,
		Math.min(
			1,
			((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
		),
	);
	const projected = { x: start.x + dx * t, y: start.y + dy * t };
	return {
		point: projected,
		distance: Math.hypot(point.x - projected.x, point.y - projected.y),
	};
}

function rulerEdges(ruler: RulerGeometry) {
	const cos = Math.cos(ruler.angle);
	const sin = Math.sin(ruler.angle);
	const along = { x: cos * (ruler.length / 2), y: sin * (ruler.length / 2) };
	const normal = { x: -sin * (ruler.width / 2), y: cos * (ruler.width / 2) };

	return [-1, 1].map((side) => ({
		start: {
			x: ruler.center.x - along.x + normal.x * side,
			y: ruler.center.y - along.y + normal.y * side,
		},
		end: {
			x: ruler.center.x + along.x + normal.x * side,
			y: ruler.center.y + along.y + normal.y * side,
		},
	}));
}

/**
 * Pick a constraint when a stroke starts. Returning a stable closure makes the
 * stroke stay on the same ruler edge even if it crosses the other edge later.
 */
export function createStrokeConstraint(
	instrument: InstrumentGeometry | null,
	start: InstrumentPoint,
	snapDistance: number,
): StrokeConstraint | null {
	if (!instrument || snapDistance <= 0) return null;

	if (instrument.type === "ruler") {
		const candidates = rulerEdges(instrument).map((edge) => ({
			edge,
			...projectToSegment(start, edge.start, edge.end),
		}));
		candidates.sort((a, b) => a.distance - b.distance);
		const nearest = candidates[0];
		if (!nearest || nearest.distance > snapDistance) return null;
		return (point) =>
			projectToSegment(point, nearest.edge.start, nearest.edge.end).point;
	}

	const dx = start.x - instrument.center.x;
	const dy = start.y - instrument.center.y;
	const distance = Math.hypot(dx, dy);
	if (Math.abs(distance - instrument.radius) > snapDistance) return null;

	let lastDirection =
		distance > EPSILON
			? { x: dx / distance, y: dy / distance }
			: { x: 1, y: 0 };
	return (point) => {
		const px = point.x - instrument.center.x;
		const py = point.y - instrument.center.y;
		const pointDistance = Math.hypot(px, py);
		if (pointDistance > EPSILON) {
			lastDirection = { x: px / pointDistance, y: py / pointDistance };
		}
		return {
			x: instrument.center.x + lastDirection.x * instrument.radius,
			y: instrument.center.y + lastDirection.y * instrument.radius,
		};
	};
}

export function rulerCorners(ruler: RulerGeometry): InstrumentPoint[] {
	const cos = Math.cos(ruler.angle);
	const sin = Math.sin(ruler.angle);
	const along = { x: cos * (ruler.length / 2), y: sin * (ruler.length / 2) };
	const normal = { x: -sin * (ruler.width / 2), y: cos * (ruler.width / 2) };
	return [
		{
			x: ruler.center.x - along.x - normal.x,
			y: ruler.center.y - along.y - normal.y,
		},
		{
			x: ruler.center.x + along.x - normal.x,
			y: ruler.center.y + along.y - normal.y,
		},
		{
			x: ruler.center.x + along.x + normal.x,
			y: ruler.center.y + along.y + normal.y,
		},
		{
			x: ruler.center.x - along.x + normal.x,
			y: ruler.center.y - along.y + normal.y,
		},
	];
}
