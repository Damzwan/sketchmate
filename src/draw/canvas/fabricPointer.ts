export interface PointLike {
	x: number;
	y: number;
}

function isPointLike(value: unknown): value is PointLike {
	const point = value as Partial<PointLike> | null | undefined;
	return Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

/**
 * Resolve a screen-space pointer from Fabric 7 events, with a fallback for
 * events produced by older Fabric builds or third-party plugins.
 */
export function resolveFabricViewportPoint(
	canvas: { getViewportPoint: (event: unknown) => unknown },
	event: unknown,
): PointLike | null {
	const fabricEvent = event as
		| { viewportPoint?: unknown; e?: unknown }
		| null
		| undefined;
	if (isPointLike(fabricEvent?.viewportPoint)) {
		return fabricEvent.viewportPoint;
	}
	if (!fabricEvent?.e) return null;
	try {
		const point = canvas.getViewportPoint(fabricEvent.e);
		return isPointLike(point) ? point : null;
	} catch {
		return null;
	}
}
