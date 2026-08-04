export const DEFAULT_ZOOM_TIERS = [
	0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32,
] as const;

export const DEFAULT_OVERVIEW_TIER = 1;

/**
 * How much the overview bitmap may be upscaled with the whole board on screen.
 *
 * At that zoom the screen asks for about one SCREENFUL of pixels for the whole
 * board — independent of how big the board is — so this is really the ratio
 * `screenEdgeInRenderPx / overviewPx`, and it is the one quality number that
 * matters for the far end of the zoom range (`minimumViewportZoomFor` explains
 * why the far end and not the near end). 1.0 would be pixel-exact; bilinear
 * upscale to ~1.6x reads as slightly soft rather than as the pixel mush a
 * screen-oblivious budget produces on a large tablet.
 *
 * `resolveDrawMemoryProfile` sizes `overviewPx` from the screen to hold it.
 * Lives HERE, in a module with no imports, because that profile is resolved at
 * app start — reaching into the rendering modules for it would pull the engine
 * into the start-up bundle.
 */
export const MAX_OVERVIEW_UPSCALE = 1.6;

/**
 * The ladder's own bottom rung — a DPR-independent DEFAULT, not the live floor.
 *
 * Used only where the engine (and therefore the content bounds the real floor is
 * derived from) is not reachable: see `minimumViewportZoomFor`.
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
 * The zoom floor, derived from the CONTENT rather than from the tier ladder.
 *
 * WHICH END OF THE RANGE IS BLURRY
 *
 * The overview bitmap holds a fixed number of pixels for the whole board, and
 * the screen asks for `zoom * renderScale` pixels per world unit. Demand
 * therefore RISES with zoom: the bitmap is at its worst at the TOP of the
 * overview band, just under `minimumTiledZoom`, and gets steadily sharper the
 * further out the viewport goes. At the far end — the whole board on screen —
 * the demand is one screenful of pixels no matter how big the board is, which
 * is what the overview budget is sized for (`overviewPx`).
 *
 * So zooming out never causes the blur; it cures it. The previous floor read the
 * band the other way round and, on any board whose overview could not serve the
 * band's TOP, closed the whole band — costing 2x of reach on a DPR-2 phone and
 * 4x on a DPR-1 desktop, in the one case (a big lobby) the band exists for. The
 * soft strip under `minimumTiledZoom` is inherent to a budget-capped bitmap and
 * was there before; it is not a reason to remove the far end.
 *
 * WHAT THE FLOOR ACTUALLY IS
 *
 * "The whole drawing fits on screen". Past that, zooming out adds only empty
 * canvas, and short of it a big board cannot be seen at all. So: always reach
 * `minimumTiledZoom` (tiles serve it unconditionally), and go further out only
 * as far as the content needs.
 *
 * A normal drawing fits well above the tiled floor and keeps exactly today's
 * behaviour. `fitZoom` non-finite (no content bounds yet) and `overviewDensity`
 * 0 (no bitmap yet, so nothing can paint the band) both resolve to the tiled
 * floor.
 */
export function minimumViewportZoomFor(
	fitZoom: number,
	overviewDensity: number,
	renderScale: number,
	zoomTiers: readonly number[] = DEFAULT_ZOOM_TIERS,
	overviewTier = DEFAULT_OVERVIEW_TIER,
): number {
	const tiled = minimumTiledZoom(renderScale, zoomTiers, overviewTier);
	if (!(overviewDensity > 0)) return tiled;
	if (!(fitZoom > 0) || !Number.isFinite(fitZoom)) return tiled;
	return Math.min(tiled, fitZoom);
}

export function clampToViewportZoom(
	zoom: number,
	maxZoom: number,
	zoomTiers: readonly number[] = DEFAULT_ZOOM_TIERS,
	minZoom = minimumViewportZoom(zoomTiers),
): number {
	return Math.min(Math.max(zoom, minZoom), Math.max(maxZoom, minZoom));
}
