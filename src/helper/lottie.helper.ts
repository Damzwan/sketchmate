import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import {
	type Config,
	DotLottie,
	DotLottieWorker,
} from "@lottiefiles/dotlottie-web";
import { onMemoryPressure } from "@/service/memoryPressure";

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

/**
 * Every DotLottie instance has its own render loop. IntersectionObserver is a
 * useful viewport gate, but Android does not promise to deliver a final
 * intersection update before hiding a WebView. The Sentry background-ANR trail
 * showed players still loading/rasterizing immediately before
 * `onTrimMemory critical`, so lifecycle gating also lives at the factory.
 */
const managedPlayers = new Set<LottiePlayer>();
let documentHidden =
	typeof document !== "undefined" && document.visibilityState === "hidden";
let nativeInactive = false;
let pressureFrozen = false;
let lifecycleInstalled = false;

function freezePlayer(player: LottiePlayer): void {
	try {
		void Promise.resolve(player.freeze()).catch(() => {
			/* worker player destroyed while the message was in flight */
		});
	} catch {
		/* a player may be destroyed while lifecycle events are being delivered */
	}
}

function unfreezePlayer(player: LottiePlayer): void {
	try {
		// freeze/unfreeze only gates the render loop; it preserves whether the
		// caller wanted the player playing, paused, or stopped.
		void Promise.resolve(player.unfreeze()).catch(() => {
			/* worker player destroyed while the message was in flight */
		});
	} catch {
		/* already destroyed */
	}
}

const runtimeIsFrozen = () =>
	documentHidden || nativeInactive || pressureFrozen;

function applyLifecycleState(): void {
	const frozen = runtimeIsFrozen();
	for (const player of managedPlayers) {
		if (frozen) freezePlayer(player);
		else unfreezePlayer(player);
	}
}

function resumeFromLifecycle(): void {
	// A foreground memory warning intentionally freezes decoration for the rest
	// of that foreground stint. A genuine hide/resume is the safe point to let
	// it animate again.
	pressureFrozen = false;
	applyLifecycleState();
}

function installLottieLifecycle(): void {
	if (lifecycleInstalled) return;
	lifecycleInstalled = true;

	if (typeof document !== "undefined") {
		document.addEventListener("visibilitychange", () => {
			documentHidden = document.visibilityState === "hidden";
			if (!documentHidden) resumeFromLifecycle();
			else applyLifecycleState();
		});
	}

	void CapacitorApp.addListener("appStateChange", ({ isActive }) => {
		nativeInactive = !isActive;
		if (isActive) resumeFromLifecycle();
		else applyLifecycleState();
	}).catch(() => {
		/* browser/unsupported platform: visibilitychange is sufficient */
	});

	onMemoryPressure((level) => {
		if (level === "moderate") return;
		pressureFrozen = true;
		applyLifecycleState();
	});
}

function managePlayer<T extends LottiePlayer>(player: T): T {
	installLottieLifecycle();
	managedPlayers.add(player);
	player.addEventListener("destroy", () => managedPlayers.delete(player));
	// play() intentionally unfreezes dotlottie. A late asset `load` handler can
	// call play after Android already backgrounded the WebView, so immediately
	// reassert the lifecycle gate whenever that happens.
	player.addEventListener("play", () => {
		if (runtimeIsFrozen()) freezePlayer(player);
	});
	if (runtimeIsFrozen()) freezePlayer(player);
	return player;
}

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
	return managePlayer(
		useWorker ? new DotLottieWorker(cfg) : new DotLottie(cfg),
	);
}

/** Main-thread variant for detached snapshot/shared canvases. */
export function createMainThreadLottie(config: Config): DotLottie {
	const cfg = config.src
		? { ...config, src: absLottieSrc(config.src) }
		: config;
	return managePlayer(new DotLottie(cfg));
}
