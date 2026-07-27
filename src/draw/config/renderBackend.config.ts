/**
 * Tile raster backend experiment.
 *
 * Both cohorts use the same CommittedLayer, tile geometry, memory budget,
 * invalidation, progressive repaint and yielded render loop. The only variable
 * is whether a tile's Fabric objects rasterize in tileBakery.worker or in the
 * existing main-thread fallback.
 *
 * A query parameter is useful for one-off A/B links and wins over the persisted
 * choice. Persisted changes take effect the next time the draw canvas is
 * created (normally after a reload).
 */
export type DrawRenderBackend = "worker" | "main";

export const DRAW_RENDER_BACKEND_QUERY_KEY = "drawBackend";
export const DRAW_RENDER_BACKEND_STORAGE_KEY = "draw_render_backend";

function parseBackend(
	value: string | null | undefined,
): DrawRenderBackend | null {
	return value === "worker" || value === "main" ? value : null;
}

/** Pure resolver kept separate so precedence and invalid values are testable. */
export function resolveDrawRenderBackend(
	search: string,
	stored: string | null | undefined,
): DrawRenderBackend {
	let queryValue: string | null = null;
	try {
		queryValue = new URLSearchParams(search).get(DRAW_RENDER_BACKEND_QUERY_KEY);
	} catch {
		// A malformed experiment URL must never prevent the canvas from starting.
	}
	return parseBackend(queryValue) ?? parseBackend(stored) ?? "main";
}

function readStoredBackend(): string | null {
	if (typeof localStorage === "undefined") return null;
	try {
		return localStorage.getItem(DRAW_RENDER_BACKEND_STORAGE_KEY);
	} catch {
		return null;
	}
}

export function getDrawRenderBackend(): DrawRenderBackend {
	const search =
		typeof window !== "undefined" ? (window.location?.search ?? "") : "";
	return resolveDrawRenderBackend(search, readStoredBackend());
}

/**
 * Persist a cohort choice. This intentionally does not hot-swap a live canvas:
 * RenderCore captures its baker during construction and changing it mid-bake
 * would make the comparison both unsafe and meaningless.
 */
export function setDrawRenderBackend(backend: DrawRenderBackend): boolean {
	if (typeof localStorage === "undefined") return false;
	try {
		localStorage.setItem(DRAW_RENDER_BACKEND_STORAGE_KEY, backend);
		return true;
	} catch {
		return false;
	}
}

/** Small console seam for device experiments and support sessions. */
export function installDrawRenderBackendDebugApi(): void {
	const root = globalThis as any;
	root.__drawBackend = getDrawRenderBackend;
	root.__setDrawBackend = (backend: DrawRenderBackend): string => {
		if (!parseBackend(backend)) {
			return 'Invalid backend. Use "worker" or "main".';
		}
		if (!setDrawRenderBackend(backend)) {
			return "Could not persist the draw backend on this device.";
		}
		const queryBackend =
			typeof window !== "undefined"
				? parseBackend(
						new URLSearchParams(window.location.search).get(
							DRAW_RENDER_BACKEND_QUERY_KEY,
						),
					)
				: null;
		if (queryBackend && queryBackend !== backend) {
			return `Saved "${backend}", but the URL still forces "${queryBackend}". Remove ?${DRAW_RENDER_BACKEND_QUERY_KEY}=... and reload.`;
		}
		return `Draw backend set to "${backend}". Reload before measuring.`;
	};
}
