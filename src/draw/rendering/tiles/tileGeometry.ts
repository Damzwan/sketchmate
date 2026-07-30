export interface WorldRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface TileRange {
	tx0: number;
	ty0: number;
	tx1: number;
	ty1: number;
}

export function pickTileTier(
	zoom: number,
	renderScale: number,
	zoomTiers: readonly number[],
): number {
	const effectiveZoom = zoom * renderScale;
	const tolerance = 1.15;
	const tier = zoomTiers.findIndex(
		(tierScale) => tierScale * tolerance >= effectiveZoom,
	);
	return tier === -1 ? zoomTiers.length - 1 : tier;
}

export function getTileRange(
	rect: WorldRect,
	tier: number,
	tileSize: number,
	zoomTiers: readonly number[],
): TileRange {
	const tileWorldSize = tileSize / zoomTiers[tier];
	return {
		tx0: Math.floor(rect.x / tileWorldSize),
		ty0: Math.floor(rect.y / tileWorldSize),
		tx1: Math.floor((rect.x + rect.w) / tileWorldSize),
		ty1: Math.floor((rect.y + rect.h) / tileWorldSize),
	};
}

export function tileToWorldRect(
	tier: number,
	tx: number,
	ty: number,
	tileSize: number,
	zoomTiers: readonly number[],
): WorldRect {
	const tileWorldSize = tileSize / zoomTiers[tier];
	return {
		x: tx * tileWorldSize,
		y: ty * tileWorldSize,
		w: tileWorldSize,
		h: tileWorldSize,
	};
}

export function viewportToWorldRect(
	viewportTransform: number[],
	surfaceSize: { w: number; h: number },
	devicePixelRatio: number,
): WorldRect {
	const zoom = viewportTransform[0];
	return {
		x: -viewportTransform[4] / zoom,
		y: -viewportTransform[5] / zoom,
		w: surfaceSize.w / (zoom * devicePixelRatio),
		h: surfaceSize.h / (zoom * devicePixelRatio),
	};
}
