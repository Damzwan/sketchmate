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

/**
 * The furthest-out zoom that is still guaranteed SHARP.
 *
 * Two things can serve a zoom level. Tiles are always sharp — they rasterize at
 * the tier they are shown at. The overview bitmap is sharp only while it holds
 * at least as many pixels as the screen asks for, i.e. while
 * `overviewDensity >= zoom * renderScale`.
 *
 * The overview is budget-capped, so its density falls as the world grows: a
 * lobby spread over ~20k world units lands near 0.1 px per world unit while the
 * top of its own zoom range wants ~0.5. That ~5x upscale is the "everything is
 * blurry zoomed out" report, and a flat floor made it always reachable.
 *
 * So the viewport is allowed into overview territory only when the bitmap covers
 * the WHOLE gap up to the first tiled tier. A normal drawing keeps every bit of
 * the existing range; a huge board trades zoom-out reach for never showing an
 * upscaled bitmap. No extra pixels are spent either way — more overview memory is
 * exactly what a low-end Android cannot give.
 *
 * `overviewDensity` of 0 means "no bitmap yet", which resolves to the tiled floor.
 */
export function sharpMinimumViewportZoom(
	overviewDensity: number,
	renderScale: number,
	zoomTiers: readonly number[] = DEFAULT_ZOOM_TIERS,
	overviewTier = DEFAULT_OVERVIEW_TIER,
): number {
	const tiled = minimumTiledZoom(renderScale, zoomTiers, overviewTier);
	if (!(overviewDensity > 0)) return tiled;
	const sharpestOverviewZoom = overviewDensity / renderScale;
	// Tolerance: the common case lands on exact equality (an overview target
	// density of 0.5 against render scale 2), and float wobble must not flip the
	// policy between sessions.
	if (sharpestOverviewZoom < tiled * 0.999) return tiled;
	return minimumViewportZoom(zoomTiers);
}

export function clampToViewportZoom(
	zoom: number,
	maxZoom: number,
	zoomTiers: readonly number[] = DEFAULT_ZOOM_TIERS,
): number {
	const minZoom = minimumViewportZoom(zoomTiers);
	return Math.min(Math.max(zoom, minZoom), Math.max(maxZoom, minZoom));
}
