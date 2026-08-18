/**
 * Does tile rasterization run on the GPU or on the CPU?
 *
 * WHY THIS IS A KNOB AT ALL
 *
 * WebView drawing is integrated with the app window's HWUI pipeline. When the
 * tile pipeline saturates the driver, RenderThread/GPU stalls can keep the UI
 * thread from dispatching input. That is consistent with the 0.4.4
 * `libIMGegl.so KEGLGetDrawableParameters` + "Unresponsive GPU" + native-lock
 * cluster, though a top frame alone is not proof of one root cause.
 *
 * A bake is many draw operations plus a texture allocation per tile; a composite
 * is one upload and one draw per tile. Rasterizing tiles on the CPU can therefore
 * remove most of the engine's GL drawing traffic. In Chromium the way to request
 * that backend is `getContext("2d", { willReadFrequently: true })`.
 *
 * WHAT IT COSTS, AND WHY IT IS NOT ON EVERYWHERE
 *
 * The work does not vanish, it moves: CPU rasterization of a 384² tile on a
 * Cortex-A53 is real milliseconds, and while the tile bakery worker is off by
 * default (`renderBackend.config.ts`) those milliseconds land on the main
 * thread. The finished software canvas must still be uploaded when the
 * accelerated visible canvas composites it, so this is not a general escape
 * from GPU work either.
 *
 * Consequently CPU mode is an EXPLICIT experiment, never an automatic device
 * policy while production uses the main-thread bakery. A support URL or stored
 * override can turn it on for a measured A/B session; the safe default is GPU.
 *
 * ORTHOGONAL TO THE BACKEND SWITCH. `worker` vs `main` says WHICH THREAD
 * rasterizes; this says WHICH PROCESSOR. Flipping the bakery on later composes
 * with this rather than replacing it, and is the combination that removes the
 * cost from the main thread entirely.
 */
export type DrawRasterMode = "gpu" | "cpu";

export const DRAW_RASTER_MODE_QUERY_KEY = "drawRaster";
export const DRAW_RASTER_MODE_STORAGE_KEY = "draw_raster_mode";

function parseMode(value: string | null | undefined): DrawRasterMode | null {
	return value === "gpu" || value === "cpu" ? value : null;
}

/**
 * Pure resolver, kept separate so precedence is testable.
 *
 * Explicit choices win over the device class in both directions: a support
 * session needs to be able to force a weak device onto either backend for a
 * controlled comparison.
 */
export function resolveDrawRasterMode(
	search: string,
	stored: string | null | undefined,
): DrawRasterMode {
	let queryValue: string | null = null;
	try {
		queryValue = new URLSearchParams(search).get(DRAW_RASTER_MODE_QUERY_KEY);
	} catch {
		// A malformed experiment URL must never prevent the canvas from starting.
	}
	return parseMode(queryValue) ?? parseMode(stored) ?? "gpu";
}

function readStoredMode(): string | null {
	if (typeof localStorage === "undefined") return null;
	try {
		return localStorage.getItem(DRAW_RASTER_MODE_STORAGE_KEY);
	} catch {
		return null;
	}
}

export function setDrawRasterMode(mode: DrawRasterMode | null): boolean {
	if (typeof localStorage === "undefined") return false;
	try {
		if (mode === null) localStorage.removeItem(DRAW_RASTER_MODE_STORAGE_KEY);
		else localStorage.setItem(DRAW_RASTER_MODE_STORAGE_KEY, mode);
		return true;
	} catch {
		return false;
	}
}

export function getDrawRasterMode(): DrawRasterMode {
	const search =
		typeof window !== "undefined" ? (window.location?.search ?? "") : "";
	return resolveDrawRasterMode(search, readStoredMode());
}
