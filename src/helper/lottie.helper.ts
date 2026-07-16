import {
	DotLottie,
	DotLottieWorker,
	type Config,
} from "@lottiefiles/dotlottie-web";
import { Capacitor } from "@capacitor/core";

/**
 * DotLottieWorker moves WASM decode + raster off the main thread (big win on a
 * webview), BUT it relies on requestAnimationFrame running INSIDE a
 * Worker+OffscreenCanvas. Android's System WebView doesn't drive that loop
 * reliably: the worker decodes the FIRST frame (so you see a static image) and
 * then never advances. So use the worker only on real web, and fall back to the
 * main-thread player on native, where the animation loop ticks correctly.
 *
 * The interop we use — play / pause / setSpeed / destroy / addEventListener
 * ("load") — is identical on both classes, so callers don't branch.
 */
const useWorker = !Capacitor.isNativePlatform();

export type LottiePlayer = DotLottie | DotLottieWorker;

/** Absolutize a (possibly relative) `.lottie` src. The worker fetches in a
 *  WorkerGlobalScope with no document base, so a dev path like
 *  `/src/assets/x.lottie` throws "Failed to parse URL" — resolve against the
 *  page origin. Harmless for the main-thread player too. */
export function absLottieSrc(src: string): string {
	try {
		return new URL(src, window.location.href).href;
	} catch {
		return src;
	}
}

export function createLottie(config: Config): LottiePlayer {
	const cfg = config.src
		? { ...config, src: absLottieSrc(config.src) }
		: config;
	return useWorker ? new DotLottieWorker(cfg) : new DotLottie(cfg);
}
