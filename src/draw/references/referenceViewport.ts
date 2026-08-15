export type ReferenceViewportTransform = readonly [
	number,
	number,
	number,
	number,
	number,
	number,
];

export interface ReferenceScreenPlacement {
	x: number;
	y: number;
	width: number;
}

const REFERENCE_HEADER_HEIGHT = 38;

function applyTransform(
	transform: ReferenceViewportTransform,
	point: { x: number; y: number },
) {
	return {
		x: transform[0] * point.x + transform[2] * point.y + transform[4],
		y: transform[1] * point.x + transform[3] * point.y + transform[5],
	};
}

function invertPoint(
	transform: ReferenceViewportTransform,
	point: { x: number; y: number },
) {
	const determinant = transform[0] * transform[3] - transform[1] * transform[2];
	if (Math.abs(determinant) < Number.EPSILON) return point;
	const x = point.x - transform[4];
	const y = point.y - transform[5];
	return {
		x: (transform[3] * x - transform[2] * y) / determinant,
		y: (-transform[1] * x + transform[0] * y) / determinant,
	};
}

function transformScale(transform: ReferenceViewportTransform) {
	return Math.max(0.001, Math.hypot(transform[0], transform[1]));
}

/** Keep a DOM reference registered to the same point on the Fabric board. */
export function transformReferencePlacement(
	placement: ReferenceScreenPlacement,
	previous: ReferenceViewportTransform,
	next: ReferenceViewportTransform,
): ReferenceScreenPlacement {
	const imageTopLeft = {
		x: placement.x,
		y: placement.y + REFERENCE_HEADER_HEIGHT,
	};
	const boardPoint = invertPoint(previous, imageTopLeft);
	const nextImageTopLeft = applyTransform(next, boardPoint);
	return {
		x: nextImageTopLeft.x,
		y: nextImageTopLeft.y - REFERENCE_HEADER_HEIGHT,
		width: placement.width * (transformScale(next) / transformScale(previous)),
	};
}
