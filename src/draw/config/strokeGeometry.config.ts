/**
 * Runtime kill switch for compact resident stroke geometry.
 *
 * Compact geometry is enabled by default. A support/benchmark URL can disable
 * it with `?compactStrokeGeometry=off`; the persisted key is useful for device
 * sessions where editing the URL is inconvenient. Changes apply on reload.
 */
export const COMPACT_STROKE_GEOMETRY_QUERY_KEY = "compactStrokeGeometry";
export const COMPACT_STROKE_GEOMETRY_STORAGE_KEY =
	"draw_compact_stroke_geometry";

function parseEnabled(value: string | null | undefined): boolean | null {
	if (value === "on" || value === "1" || value === "true") return true;
	if (value === "off" || value === "0" || value === "false") return false;
	return null;
}

export function resolveCompactStrokeGeometry(
	search: string,
	stored: string | null | undefined,
): boolean {
	let queryValue: string | null = null;
	try {
		queryValue = new URLSearchParams(search).get(
			COMPACT_STROKE_GEOMETRY_QUERY_KEY,
		);
	} catch {
		// A malformed experiment URL must not prevent the canvas from starting.
	}
	return parseEnabled(queryValue) ?? parseEnabled(stored) ?? true;
}

let cachedEnabled: boolean | undefined;

export function isCompactStrokeGeometryEnabled(): boolean {
	if (cachedEnabled !== undefined) return cachedEnabled;
	const search =
		typeof window !== "undefined" ? (window.location?.search ?? "") : "";
	let stored: string | null = null;
	if (typeof localStorage !== "undefined") {
		try {
			stored = localStorage.getItem(COMPACT_STROKE_GEOMETRY_STORAGE_KEY);
		} catch {
			// Storage can be unavailable in private/restricted WebViews.
		}
	}
	cachedEnabled = resolveCompactStrokeGeometry(search, stored);
	return cachedEnabled;
}
