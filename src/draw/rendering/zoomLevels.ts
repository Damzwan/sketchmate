export const DEFAULT_ZOOM_TIERS = [
	0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32,
] as const;

export const DEFAULT_OVERVIEW_TIER = 1;

export function minimumTiledZoom(
	renderScale: number,
	zoomTiers: readonly number[] = DEFAULT_ZOOM_TIERS,
	overviewTier = DEFAULT_OVERVIEW_TIER,
): number {
	const firstTiledTier =
		zoomTiers[overviewTier + 1] ?? zoomTiers[zoomTiers.length - 1];
	return firstTiledTier / renderScale;
}

export function clampToTiledZoom(
	zoom: number,
	maxZoom: number,
	renderScale: number,
): number {
	const minZoom = minimumTiledZoom(renderScale);
	return Math.min(Math.max(zoom, minZoom), Math.max(maxZoom, minZoom));
}
