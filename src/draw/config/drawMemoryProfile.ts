import { MAX_OVERVIEW_UPSCALE } from "@/draw/rendering/zoomLevels";

export interface DrawMemoryProfile {
	tileBudgetMB: number;
	overviewPx: number;
	tilePoolMax: number;
	/** Aggregate pixel cap for one transform bitmap/canvas, independent of shape. */
	transformMaxPixels: number;
	transformMaxDimension: number;
	overviewPatchMax: number;
	overviewWorkBudgetMs: number;
	renderChunk: number;
	/**
	 * How much rasterization work (see rendering/renderCost.ts) one
	 * UNINTERRUPTIBLE synchronous block may contain.
	 *
	 * The paths this bounds — `rebuildTileSync`, `repairTileRegionSync`,
	 * `WorldOverview.patchRect` — cannot yield mid-object, so once they start
	 * they hold the main thread until the last object is drawn. They previously
	 * bounded themselves by object COUNT, which is not a bound on cost at all.
	 *
	 * Units are "roughly one stroked path segment". These starting values are
	 * calibrated from the one measurement we have (a dense erase tile at ~13 ms,
	 * worst case 268 ms) and are therefore ESTIMATES. `syncRepairDeclines` and
	 * `syncRepairCostMax` in the metrics snapshot exist to replace them with
	 * field data — tune from those, not by feel.
	 *
	 * Too low costs sharpness (the region shows a coarser tile for one bake
	 * round-trip). Too high costs frames. On the devices that ANR, err low.
	 */
	syncRenderCostBudget: number;
	/**
	 * How many tiles may hold a writable OffscreenCanvas so a stamp can draw into
	 * them in place instead of replacing their GPU texture (see
	 * rendering/tiles/tileStore.ts → `TileSurface`).
	 *
	 * Sized to the interactive working set — the tiles a single stroke crosses —
	 * NOT to the cache. Each hot tile holds a pooled canvas, so this must stay
	 * well under `tilePoolMax`'s replacement capacity, and compositing from a
	 * canvas can be slower than from a bitmap on some drivers. 0 restores the
	 * pre-existing bitmap-only behaviour exactly.
	 */
	hotTileMax: number;
}

export interface DrawMemoryDevice {
	mobile: boolean;
	lowEnd: boolean;
	deviceMemoryGB: number;
	hardwareConcurrency: number;
	/**
	 * Longest screen edge in RENDER pixels (CSS px x the capped render DPR).
	 * Optional: omitted in tests and on any host without a screen, where the
	 * device-class `overviewPx` stands on its own.
	 */
	screenEdgePx?: number;
}

/**
 * Ceiling on the screen-derived `overviewPx` floor, per device class.
 *
 * The floor exists so a phone-sized screen never outruns the overview bitmap;
 * these caps stop a large tablet or a HiDPI desktop from turning that into an
 * unbounded allocation. Raising `overviewPx` is not free elsewhere either — the
 * tile budget subtracts it (see TileLayerBase's MEM_HARD), so a bigger overview
 * is paid for out of the tile cache.
 */
const OVERVIEW_SCREEN_FLOOR_CAP = {
	lowEnd: 1024,
	mobile: 1536,
	desktop: 2560,
} as const;

/**
 * Raise `overviewPx` so the bitmap can fill the screen at full zoom-out.
 *
 * The zoom floor is "the whole drawing fits on screen"
 * (rendering/zoomLevels.ts → `minimumViewportZoomFor`), and the pixels THAT asks
 * for are `screenPixels`, not `contentSize x someDensity` — a bigger board is
 * shown smaller, so the demand at full zoom-out does not grow with it. That
 * makes the honest overview budget a function of the SCREEN, which is what these
 * device-class constants were only accidentally approximating: they land right
 * for a phone, but on a tablet the same 1024² is a 2x upscale of the one view
 * this whole band exists to serve.
 *
 * Divided by the upscale tolerance because the far end is allowed to spend it.
 */
function withScreenOverviewFloor(
	profile: DrawMemoryProfile,
	device: DrawMemoryDevice,
	maxUpscale: number,
): DrawMemoryProfile {
	const edge = device.screenEdgePx;
	if (!edge || !(edge > 0) || !Number.isFinite(edge)) return profile;
	const cap = !device.mobile
		? OVERVIEW_SCREEN_FLOOR_CAP.desktop
		: device.lowEnd
			? OVERVIEW_SCREEN_FLOOR_CAP.lowEnd
			: OVERVIEW_SCREEN_FLOOR_CAP.mobile;
	const floor = Math.min(cap, Math.ceil(edge / Math.max(1, maxUpscale)));
	if (floor <= profile.overviewPx) return profile;
	return { ...profile, overviewPx: floor };
}

/** Pure device-class policy, kept separate so it can be regression-tested. */
export function resolveDrawMemoryProfile(
	device: DrawMemoryDevice,
	maxOverviewUpscale = MAX_OVERVIEW_UPSCALE,
): DrawMemoryProfile {
	return withScreenOverviewFloor(
		resolveDeviceClassProfile(device),
		device,
		maxOverviewUpscale,
	);
}

function resolveDeviceClassProfile(
	device: DrawMemoryDevice,
): DrawMemoryProfile {
	if (!device.mobile) {
		return {
			tileBudgetMB: 128,
			overviewPx: 2048,
			tilePoolMax: 8,
			transformMaxPixels: 2048 * 2048,
			transformMaxDimension: 2048,
			overviewPatchMax: 200,
			overviewWorkBudgetMs: 8,
			renderChunk: 32,
			syncRenderCostBudget: 40_000,
			hotTileMax: 6,
		};
	}

	if (!device.lowEnd) {
		return {
			tileBudgetMB: 72,
			overviewPx: 1024,
			tilePoolMax: 4,
			// A transform is shown only while the pointer is down; exact tiles replace
			// it on drop. Keep the compositor texture deliberately low-resolution and
			// let CSS scale it instead of moving a 16 MB 2048² surface at 60 fps.
			transformMaxPixels: 1_250_000,
			transformMaxDimension: 1536,
			overviewPatchMax: 200,
			overviewWorkBudgetMs: 8,
			renderChunk: 16,
			syncRenderCostBudget: 18_000,
			hotTileMax: 4,
		};
	}

	const severelyConstrained =
		device.deviceMemoryGB <= 2 || device.hardwareConcurrency <= 2;
	return {
		tileBudgetMB: severelyConstrained ? 24 : 32,
		// 768² is 2.25 MB instead of 4 MB at 1024², and also cuts overview
		// clear/raster fill by 44% while remaining ample for a whole-board fallback.
		overviewPx: 768,
		tilePoolMax: 2,
		// Selection + vacated ImageBitmaps are copied into two DOM canvases. At the
		// old limits those four surfaces peaked at 16–24 MB even before tiles. These
		// are transient previews, so prefer a little drag-time softness over GPU
		// allocation pressure; the committed tiles are still rendered exactly.
		transformMaxPixels: severelyConstrained ? 500_000 : 750_000,
		transformMaxDimension: 1280,
		overviewPatchMax: severelyConstrained ? 32 : 48,
		overviewWorkBudgetMs: severelyConstrained ? 3 : 4,
		renderChunk: severelyConstrained ? 4 : 6,
		// This is the cohort that ANRs. A declined repair here is one blurry
		// region for one bake round-trip; an accepted one can be a dropped
		// second.
		syncRenderCostBudget: severelyConstrained ? 6_000 : 9_000,
		// This cohort has the least GPU memory AND the most to gain from not
		// churning textures, so keep a hot set but a minimal one: a stroke rarely
		// crosses more than two tiles at the tier it is drawn at.
		hotTileMax: 2,
	};
}

export function fitBitmapDimensions(
	width: number,
	height: number,
	maxDimension: number,
	maxPixels: number,
): { width: number; height: number; factor: number } {
	if (width <= 0 || height <= 0) return { width: 0, height: 0, factor: 0 };
	const factor = Math.min(
		1,
		maxDimension / width,
		maxDimension / height,
		Math.sqrt(maxPixels / (width * height)),
	);
	return {
		width: Math.max(1, Math.floor(width * factor)),
		height: Math.max(1, Math.floor(height * factor)),
		factor,
	};
}
