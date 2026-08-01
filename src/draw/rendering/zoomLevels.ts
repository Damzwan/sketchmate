export const DEFAULT_ZOOM_TIERS = [
	0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32,
] as const;

export const DEFAULT_OVERVIEW_TIER = 1;

/**
 * Furthest the user may zoom out in world space.
 *
 * This is deliberately independent of DPR. At this scale the adaptive overview
 * is the authoritative picture; forcing the viewport to stay on a tile-backed
 * tier prevents collaborators from seeing the surrounding canvas for no memory
 * benefit.
 */
export function minimumViewportZoom(
	zoomTiers: readonly number[] = DEFAULT_ZOOM_TIERS,
): number {
	return zoomTiers[0] ?? 0.125;
}

export function minimumTiledZoom(
	renderScale: number,
	zoomTiers: readonly number[] = DEFAULT_ZOOM_TIERS,
	overviewTier = DEFAULT_OVERVIEW_TIER,
): number {
	const firstTiledTier =
		zoomTiers[overviewTier + 1] ?? zoomTiers[zoomTiers.length - 1];
	return firstTiledTier / renderScale;
}

export function clampToViewportZoom(
	zoom: number,
	maxZoom: number,
	zoomTiers: readonly number[] = DEFAULT_ZOOM_TIERS,
): number {
	const minZoom = minimumViewportZoom(zoomTiers);
	return Math.min(Math.max(zoom, minZoom), Math.max(maxZoom, minZoom));
}
