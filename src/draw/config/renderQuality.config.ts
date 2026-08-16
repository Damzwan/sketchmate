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
//   • configureFabric() assigning `config.devicePixelRatio = getRenderDpr()`
//     — fabric's getRetinaScaling() reads that, so EVERY fabric-internal
//     consumer is capped automatically.
//   • the render surface's getDpr() returning getRenderDpr().
// Anything reading main-canvas pixels must use `canvas.getRetinaScaling()` or
// `getRenderDpr()`, never `window.devicePixelRatio`.

// Dependency-free by design (see the note in that module) — it reads
// localStorage and nothing else, so it is safe on this import path.
import {
	deviceProfile,
	IS_LOW_RAM_DEVICE,
	IS_WEAK_GPU_DEVICE,
	isSeverelyMemoryConstrained,
} from "@/service/deviceProfile";
import { DRAW_QUALITY_DEMOTION } from "./qualityDemotion";

// `isPlatform` reads `window` on the way in, so a module that merely IMPORTS
// this file cannot be loaded without a DOM. That is not hypothetical: the tile
// renderer picks its work thresholds from these flags and is loaded by the
// headless test environment (and, if it ever moves, by the bakery worker).
// Off-DOM the desktop profile is the right assumption — no worker or test is
// running on a phone's GPU.
const HAS_DOM = typeof window !== "undefined";

/**
 * Is this a phone/tablet-class device?
 *
 * Spelled out rather than taken from `isPlatform` or `helper/platform.helper`,
 * and the reason has changed twice, so both are recorded:
 *
 *   • `isMobile` from general/platform helpers pulls the router, firebase and
 *     the auth store into the draw engine's import graph (and risks a
 *     "Cannot access X before initialization" cycle).
 *   • `isPlatform` from `@ionic/vue` pulls the Vue barrel, and with it
 *     `vue/runtime-dom`, which calls `document.createElement` at module
 *     evaluation. This module sits on the import path of
 *     `rendering/rasterSurface` — every raster surface the engine allocates —
 *     and that path must stay loadable outside a full DOM (the headless tests,
 *     and the bakery worker if it ever reaches there).
 *
 * The clauses below are Ionic's own definition of the four platforms the
 * original expression tested, in the same order of cheapness: Capacitor's
 * global, the two UA families, iPadOS (which reports as a Mac and is separable
 * only by touch points), and finally `any-pointer: coarse`, which is literally
 * how Ionic defines `mobile`.
 */
const IS_MOBILE =
	HAS_DOM &&
	(!!(globalThis as any).Capacitor?.isNativePlatform?.() ||
		/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
		(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.platform)) ||
		(typeof matchMedia === "function" &&
			matchMedia("(any-pointer: coarse)").matches));
const HW = (globalThis.navigator as any)?.hardwareConcurrency || 4;
const DEVICE_MEM_GB =
	(globalThis.navigator as any)?.deviceMemory || (IS_MOBILE ? 4 : 8);
const NATIVE_TOTAL_MEM_MB = deviceProfile().totalMemMB;

export const IS_MOBILE_DEVICE = IS_MOBILE;
export const DRAW_HARDWARE_CONCURRENCY = HW;
export const DRAW_DEVICE_MEMORY_GB = DEVICE_MEM_GB;
export const DRAW_NATIVE_TOTAL_MEMORY_MB = NATIVE_TOTAL_MEM_MB;

/**
 * `hardwareConcurrency` alone was a bad proxy for "can this device hold a big
 * tile cache": an 8-core phone failed `HW <= 4` and got the full DESKTOP budget.
 * Device memory is the honest signal, and any mobile stays conservative.
 *
 * The GPU and low-RAM terms come from `service/deviceProfile` and are LEARNED —
 * they are empty on the very first launch after install and populated from
 * then on. See that module for why they cannot be read synchronously here.
 */
export const IS_LOW_END_DEVICE =
	IS_MOBILE &&
	(HW <= 4 ||
		DEVICE_MEM_GB <= 4 ||
		IS_WEAK_GPU_DEVICE ||
		IS_LOW_RAM_DEVICE ||
		DRAW_QUALITY_DEMOTION >= 1);

/**
 * The cohort protected most aggressively because its memory/fill-rate signals
 * make a render-path stall materially more likely.
 *
 * This used to live inside `drawMemoryProfile.resolveDeviceClassProfile` as a
 * local `severelyConstrained`, which meant the tile budget knew about it but
 * the RESOLUTION did not. Lifted here so both read one predicate.
 *
 * The GPU term is `weak AND <= 4 GB` rather than `weak` alone on purpose: a
 * Mali-G52 in a 6 GB phone is a mid-range part that copes, while the same GPU
 * beside 2–4 GB resembles the constrained cohort implicated by the 0.4.4
 * `libIMGegl` / "Unresponsive GPU" reports.
 * Android's own `isLowRamDevice()` is taken at face value — it is the verdict
 * that governs how the platform itself treats the process.
 *
 * The last term is the escape hatch for hardware no detection rule covers: a
 * device that repeatedly stalled in earlier sessions demotes itself into this
 * class (see qualityDemotion.ts).
 */
export const IS_SEVERELY_CONSTRAINED_DEVICE =
	IS_MOBILE &&
	(IS_LOW_RAM_DEVICE ||
		isSeverelyMemoryConstrained(NATIVE_TOTAL_MEM_MB) ||
		DEVICE_MEM_GB <= 2 ||
		HW <= 2 ||
		(IS_WEAK_GPU_DEVICE && DEVICE_MEM_GB <= 4) ||
		DRAW_QUALITY_DEMOTION >= 2);

/**
 * Ceiling on the backing-store resolution, in device pixels per CSS pixel.
 * This is BOTH the tile bake scale (CommittedLayer `maxRenderScale`) and the
 * composite/canvas scale — they must not drift apart, which is why both read
 * this constant.
 *
 * 1.0 on the severe cohort. F4 took the cap from raw DPR (up to 3) down to 1.5
 * and stopped there; 1.5 is still 2.25x the pixels of 1.0 in every full-surface
 * clear, every tile bake and every canvas backing store, and these devices are
 * fill-rate bound — a tile-based deferred GPU with no memory bandwidth to spare.
 * The visible cost is softness on a small screen; the cost of not doing it is
 * the increased probability of a RenderThread/input-dispatch stall.
 */
export const MAX_RENDER_SCALE = IS_SEVERELY_CONSTRAINED_DEVICE
	? 1
	: IS_LOW_END_DEVICE
		? 1.5
		: 2;

let cachedRenderDpr = 0;

/**
 * The device-pixel ratio the whole engine renders at. Cached deliberately: a
 * mid-session change in `window.devicePixelRatio` must NOT desync the canvas
 * backing store (sized once, from fabric's config) from the per-frame
 * composite transform. Consistency beats picking up a display change.
 */
export function getRenderDpr(): number {
	if (cachedRenderDpr) return cachedRenderDpr;
	const raw = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
	cachedRenderDpr = Math.max(1, Math.min(raw, MAX_RENDER_SCALE));
	return cachedRenderDpr;
}

/**
 * Longest screen edge in RENDER pixels — the most pixels the engine can ever be
 * asked to put on screen at once.
 *
 * `screen` rather than the canvas element: the canvas is not sized yet when the
 * memory profile is resolved, and a rotation or a resized window must not
 * change a budget the tile cache was built against. Uses `getRenderDpr()`, not
 * raw `devicePixelRatio`, because the composite itself is capped there.
 */
export const DRAW_SCREEN_EDGE_PX =
	typeof window !== "undefined" && window.screen
		? Math.max(window.screen.width || 0, window.screen.height || 0) *
			getRenderDpr()
		: 0;

/** True when the cap is actually biting — useful for reporting the A/B cohort. */
export function isRenderDprCapped(): boolean {
	const raw = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
	return raw > getRenderDpr() + 0.001;
}
