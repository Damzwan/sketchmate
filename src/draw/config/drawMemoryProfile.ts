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
}

export interface DrawMemoryDevice {
	mobile: boolean;
	lowEnd: boolean;
	deviceMemoryGB: number;
	hardwareConcurrency: number;
}

/** Pure device-class policy, kept separate so it can be regression-tested. */
export function resolveDrawMemoryProfile(
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
		};
	}

	if (!device.lowEnd) {
		return {
			tileBudgetMB: 72,
			overviewPx: 1024,
			tilePoolMax: 4,
			transformMaxPixels: 2048 * 2048,
			transformMaxDimension: 2048,
			overviewPatchMax: 200,
			overviewWorkBudgetMs: 8,
			renderChunk: 16,
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
		// The old dimension-only 2048² limit allowed a selection bitmap, vacated
		// bitmap and their two DOM canvases to peak near 64 MB. Bound area too.
		transformMaxPixels: severelyConstrained ? 1_000_000 : 1_500_000,
		transformMaxDimension: 2048,
		overviewPatchMax: severelyConstrained ? 32 : 48,
		overviewWorkBudgetMs: severelyConstrained ? 3 : 4,
		renderChunk: severelyConstrained ? 4 : 6,
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
