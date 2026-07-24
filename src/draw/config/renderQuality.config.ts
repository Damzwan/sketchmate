// renderQuality.config.ts
//
// ONE source of truth for the pixel resolution the draw engine renders at, and
// for the device class that resolution is chosen from.
//
// WHY THIS EXISTS
//
// Every canvas in the draw module used to size itself from raw
// `window.devicePixelRatio`. On a DPR-3 phone that is ~2.4Mpx for fabric's
// lower canvas, the same again for its upper canvas, and the same again for the
// transform drag layer — all cleared and refilled every frame
// (CommittedLayer.composite clears the full surface; rerenderActiveObjectControls
// clears the whole top context whenever anything is selected).
//
// Meanwhile TILES only ever rasterize at `MAX_RENDER_SCALE` (CommittedLayer
// caps `renderScale` at exactly this value), so on a DPR-3 device those extra
// device pixels were pure upscale for tile content. They bought real sharpness
// only for text-edit mode and selection controls.
//
// That fill rate is the prime suspect behind the "Unresponsive GPU" /
// libGLESv2_adreno / libgsl ANR + SIGSEGV cluster in 0.4.3 — see
// docs/DRAW_ENGINE_PERF.md finding F4. Capping cuts per-frame pixels ~55% on a
// DPR-3 device, and canvas memory by the same factor.
//
// INVARIANT
//
// `getRenderDpr()` and fabric's own retina scaling MUST agree, or hit-testing,
// pixel reads (bucket fill) and the eraser's screen-space clip rect all land at
// the wrong coordinates. Agreement is enforced by:
//   • changeFabricSettings() assigning `config.devicePixelRatio = getRenderDpr()`
//     — fabric's getRetinaScaling() reads that, so EVERY fabric-internal
//     consumer is capped automatically.
//   • the render surface's getDpr() returning getRenderDpr().
// Anything reading main-canvas pixels must use `canvas.getRetinaScaling()` or
// `getRenderDpr()`, never `window.devicePixelRatio`.

// NB: `isPlatform` directly, NOT `isMobile` from general.helper. This is a
// config module read during canvas construction; general.helper transitively
// pulls in the router, firebase and the auth store, which would drag all of
// that into the draw engine's import graph (and risks a
// "Cannot access X before initialization" cycle). `isMobile` is exactly this
// expression — keep the two in sync if that ever changes.
import { isPlatform } from "@ionic/vue";

const IS_MOBILE =
	isPlatform("mobile") ||
	isPlatform("capacitor") ||
	isPlatform("android") ||
	isPlatform("ios");
const HW = (navigator as any)?.hardwareConcurrency || 4;
const DEVICE_MEM_GB = (navigator as any)?.deviceMemory || (IS_MOBILE ? 4 : 8);

export const IS_MOBILE_DEVICE = IS_MOBILE;

/**
 * `hardwareConcurrency` alone was a bad proxy for "can this device hold a big
 * tile cache": an 8-core phone failed `HW <= 4` and got the full DESKTOP budget.
 * Device memory is the honest signal, and any mobile stays conservative.
 */
export const IS_LOW_END_DEVICE = IS_MOBILE && (HW <= 4 || DEVICE_MEM_GB <= 4);

/**
 * Ceiling on the backing-store resolution, in device pixels per CSS pixel.
 * This is BOTH the tile bake scale (CommittedLayer `maxRenderScale`) and the
 * composite/canvas scale — they must not drift apart, which is why both read
 * this constant.
 */
export const MAX_RENDER_SCALE = IS_LOW_END_DEVICE ? 1.5 : 2;

let cachedRenderDpr = 0;

/**
 * The device-pixel ratio the whole engine renders at. Cached deliberately: a
 * mid-session change in `window.devicePixelRatio` must NOT desync the canvas
 * backing store (sized once, from fabric's config) from the per-frame
 * composite transform. Consistency beats picking up a display change.
 */
export function getRenderDpr(): number {
	if (cachedRenderDpr) return cachedRenderDpr;
	const raw =
		(typeof window !== "undefined" && window.devicePixelRatio) || 1;
	cachedRenderDpr = Math.max(1, Math.min(raw, MAX_RENDER_SCALE));
	return cachedRenderDpr;
}

/** True when the cap is actually biting — useful for reporting the A/B cohort. */
export function isRenderDprCapped(): boolean {
	const raw = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
	return raw > getRenderDpr() + 0.001;
}
