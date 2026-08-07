import { Capacitor } from "@capacitor/core";
import { DotLottie } from "@lottiefiles/dotlottie-web";
import { absLottieSrc, createLottie, type LottiePlayer } from "./lottie.helper";

/**
 * Shared sprite rendering for ProfileWorld (and any repeated ambient lottie).
 *
 * Three strategies, picked per sprite:
 *
 * 1. FROZEN — one first-frame snapshot per src, cached for the whole session
 *    and stamped into every canvas with a single drawImage. Zero players, zero
 *    per-frame work. Used for sprites whose motion comes from the CSS travel
 *    animation anyway (moon, astronaut, meteors…) and for whole static/low-end
 *    worlds (feed cards). This is the path a 20-item feed rides.
 *
 * 2. NATIVE SHARED — Android WebView can't run DotLottieWorker (no rAF inside
 *    Worker/OffscreenCanvas ⇒ frozen on frame 0), so animation is main-thread
 *    no matter what. Decode ONCE per sprite type into a hidden master canvas
 *    and fan the frame out to every visible canvas with drawImage — N cheap
 *    GPU blits instead of N wasm decode+rasters. 3 fish + 2 turtles + 2
 *    jellyfish = 3 decoders, not 7.
 *
 * 3. WEB WORKER — real browsers get the old per-canvas DotLottieWorker (decode
 *    + raster fully off the main thread), unchanged.
 *
 * A handle's frozen-ness is fixed at acquire time; callers re-bind (remount)
 * to change it. That matches every current usage (staticMode never flips
 * in-place on a mounted world).
 */

export interface SpriteHandle {
	/** Play/pause this subscriber. The shared player runs iff ≥1 sub is active. */
	setActive(active: boolean): void;
	destroy(): void;
}

export interface AcquireSpriteOptions {
	canvas: HTMLCanvasElement;
	src: string;
	/** Render a single cached frame instead of animating. */
	frozen?: boolean;
	/** Initial run state (native/web animated paths). */
	active?: boolean;
	/** Backing-store resolution of the shared master / frozen snapshot, in
	    physical px. Pass ≈ the largest on-screen size of this sprite type. */
	masterSize?: number;
}

const isNativePlatform = Capacitor.isNativePlatform();

export const SPRITE_DPR = Math.min(
	typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
	1.5,
);

const MASTER_MIN = 96;
const MASTER_MAX = 384;
const clampMaster = (px?: number) =>
	Math.round(Math.min(MASTER_MAX, Math.max(MASTER_MIN, px || 256)));

/** Size a visible canvas's backing store from its CSS box. Returns false while
 *  the element has no box yet (display:none mount) — the ResizeObserver will
 *  call again once it gets one. */
function sizeCanvas(canvas: HTMLCanvasElement): boolean {
	const rect = canvas.getBoundingClientRect();
	// offsetWidth ignores transforms (world-preview scale) — matches autoResize.
	const w = Math.round((canvas.offsetWidth || rect.width) * SPRITE_DPR);
	const h = Math.round((canvas.offsetHeight || rect.height) * SPRITE_DPR);
	if (!w || !h) return false;
	if (canvas.width !== w || canvas.height !== h) {
		canvas.width = w;
		canvas.height = h;
	}
	return true;
}

function blit(from: HTMLCanvasElement, to: HTMLCanvasElement) {
	const ctx = to.getContext("2d");
	if (!ctx || !from.width || !from.height || !to.width || !to.height) return;
	// Sprites are transparent — clear or old frames ghost underneath.
	ctx.clearRect(0, 0, to.width, to.height);
	ctx.drawImage(from, 0, 0, from.width, from.height, 0, 0, to.width, to.height);
}

// ── 1. Frozen first-frame cache ─────────────────────────────────────────────

// Detached scratch/master canvases MUST disable freezeOnOffscreen: dotlottie's
// default puts an IntersectionObserver on the canvas, a never-in-DOM canvas
// never intersects, and the player freezes before rendering a single frame.
const DETACHED_RENDER_CONFIG = {
	autoResize: false,
	freezeOnOffscreen: false,
} as const;

// null = load failed; the cache entry is dropped so the next request retries.
const frozenFrames = new Map<string, Promise<HTMLCanvasElement | null>>();

function getFrozenFrame(
	src: string,
	size: number,
): Promise<HTMLCanvasElement | null> {
	let cached = frozenFrames.get(src);
	if (cached) return cached;
	cached = new Promise<HTMLCanvasElement | null>((resolve) => {
		const scratch = document.createElement("canvas");
		scratch.width = size;
		scratch.height = size;
		// Main-thread player even on web: one frame once is cheaper than a worker.
		const player = new DotLottie({
			canvas: scratch,
			src: absLottieSrc(src),
			loop: false,
			autoplay: false,
			layout: { fit: "contain", align: [0.5, 0.5] },
			renderConfig: DETACHED_RENDER_CONFIG,
		});
		let done = false;
		const finish = (ok: boolean) => {
			if (done) return;
			done = true;
			let snap: HTMLCanvasElement | null = null;
			if (ok) {
				snap = document.createElement("canvas");
				snap.width = scratch.width;
				snap.height = scratch.height;
				snap.getContext("2d")?.drawImage(scratch, 0, 0);
			} else {
				// Don't poison the session with a blank frame — retry next request.
				frozenFrames.delete(src);
			}
			try {
				player.destroy();
			} catch {
				/* already gone */
			}
			resolve(snap);
		};
		// The 'frame' event drains BEFORE the pixels hit the canvas (dotlottie
		// ticks, dispatches events, THEN draws — all in one task), so snapshot on
		// a 0-timeout: it runs after the current task, i.e. after the draw.
		player.addEventListener("frame", () => {
			if (!done) setTimeout(() => finish(true), 0);
		});
		player.addEventListener("load", () => {
			try {
				// Snapshot MID-animation, not frame 0 — plenty of sprites fade in
				// from transparent, so frame 0 stamps a blank/ghost sprite. setFrame
				// draws synchronously; play() is belt-and-braces for assets where it
				// doesn't, and the 30ms fallback covers a missing 'frame' event.
				player.setFrame(Math.floor((player.totalFrames || 1) * 0.4));
			} catch {
				/* fall through to play */
			}
			try {
				player.play();
			} catch {
				/* setFrame likely already drew */
			}
			setTimeout(() => finish(true), 30);
		});
		player.addEventListener("loadError", () => finish(false));
		// Never leave callers waiting forever on a broken asset.
		setTimeout(() => finish(false), 8000);
	});
	frozenFrames.set(src, cached);
	return cached;
}

/** Pre-decode a sprite's frozen frame (e.g. on idle) so canvases binding later
 *  stamp instantly instead of popping in after load+decode. */
export function warmFrozenFrame(src: string, masterSize?: number): void {
	void getFrozenFrame(src, clampMaster(masterSize));
}

/** Prime the HTTP cache for an animated sprite so its player's fetch is a
 *  cache hit when a world/preview actually mounts it. */
export function prefetchSprite(src: string): void {
	try {
		void fetch(absLottieSrc(src)).catch(() => {
			/* best-effort warmup */
		});
	} catch {
		/* best-effort warmup */
	}
}

function acquireFrozen(opts: AcquireSpriteOptions): SpriteHandle {
	const { canvas, src } = opts;
	const size = clampMaster(opts.masterSize);
	let dead = false;
	// Start decoding NOW — not when the canvas finally gets a layout box.
	void getFrozenFrame(src, size);
	const stamp = () => {
		if (dead || !sizeCanvas(canvas)) return;
		getFrozenFrame(src, size).then((frame) => {
			if (!dead && frame) blit(frame, canvas);
		});
	};
	// Fires once on observe (solves the 0-rect display:none mount) and again on
	// any later size change.
	const ro = new ResizeObserver(stamp);
	ro.observe(canvas);
	stamp();
	return {
		setActive() {
			/* a frozen frame has no run state */
		},
		destroy() {
			dead = true;
			ro.disconnect();
		},
	};
}

// ── 2. Native shared master pool ────────────────────────────────────────────

interface PoolSub {
	canvas: HTMLCanvasElement;
	active: boolean;
	ro: ResizeObserver;
}

interface PoolEntry {
	player: DotLottie;
	master: HTMLCanvasElement;
	subs: Set<PoolSub>;
	hasFrame: boolean;
	playing: boolean;
}

const pool = new Map<string, PoolEntry>();

function updateRunState(entry: PoolEntry) {
	const shouldPlay = [...entry.subs].some((s) => s.active);
	if (shouldPlay === entry.playing) return;
	entry.playing = shouldPlay;
	try {
		shouldPlay ? entry.player.play() : entry.player.pause();
	} catch {
		/* torn down mid-transition */
	}
}

function getPoolEntry(src: string, masterSize: number): PoolEntry {
	const entry = pool.get(src);
	if (entry) return entry;

	const master = document.createElement("canvas");
	master.width = masterSize;
	master.height = masterSize;

	const player = new DotLottie({
		canvas: master,
		src: absLottieSrc(src),
		loop: true,
		autoplay: false,
		layout: { fit: "contain", align: [0.5, 0.5] },
		renderConfig: DETACHED_RENDER_CONFIG,
	});

	const created: PoolEntry = {
		player,
		master,
		subs: new Set(),
		hasFrame: false,
		playing: false,
	};

	// 'frame' fires BEFORE that frame's pixels land on the master (dotlottie
	// ticks → dispatches → draws, one task). During playback that just means
	// subs run one frame behind — invisible. The FIRST fan-out must be deferred
	// a task though, or every sub copies a still-blank master.
	player.addEventListener("frame", () => {
		if (!created.hasFrame) {
			created.hasFrame = true;
			setTimeout(() => {
				// Paint EVERY sub (even paused ones) so nothing is blank, then drop
				// back to the governed run state.
				created.subs.forEach((s) => blit(master, s.canvas));
				if (!created.playing) {
					try {
						player.pause();
					} catch {
						/* torn down */
					}
				}
			}, 0);
			return;
		}
		created.subs.forEach((s) => {
			if (s.active) blit(master, s.canvas);
		});
	});
	// Always render one frame on load; run state takes over from there.
	player.addEventListener("load", () => {
		try {
			player.play();
		} catch {
			/* torn down */
		}
	});

	pool.set(src, created);
	return created;
}

function acquirePooled(opts: AcquireSpriteOptions): SpriteHandle {
	const { canvas, src } = opts;
	const entry = getPoolEntry(src, clampMaster(opts.masterSize));

	const sub: PoolSub = {
		canvas,
		active: opts.active !== false,
		ro: new ResizeObserver(() => {
			if (sizeCanvas(canvas) && entry.hasFrame) blit(entry.master, canvas);
		}),
	};
	sub.ro.observe(canvas);
	sizeCanvas(canvas);
	if (entry.hasFrame) blit(entry.master, canvas);
	entry.subs.add(sub);
	updateRunState(entry);

	return {
		setActive(active: boolean) {
			if (sub.active === active) return;
			sub.active = active;
			// Waking up: repaint the current frame immediately so the sprite doesn't
			// hold a stale pose until the next render tick.
			if (active && entry.hasFrame) blit(entry.master, canvas);
			updateRunState(entry);
		},
		destroy() {
			sub.ro.disconnect();
			entry.subs.delete(sub);
			if (entry.subs.size === 0) {
				pool.delete(src);
				try {
					entry.player.destroy();
				} catch {
					/* already gone */
				}
			} else {
				updateRunState(entry);
			}
		},
	};
}

// ── 3. Web per-canvas worker ────────────────────────────────────────────────

function acquireWorker(opts: AcquireSpriteOptions): SpriteHandle {
	const { canvas, src } = opts;
	let active = opts.active !== false;
	let loaded = false;
	let hasFrame = false;
	const player: LottiePlayer = createLottie({
		canvas,
		src,
		loop: true,
		autoplay: false,
		layout: { fit: "contain", align: [0.5, 0.5] },
		renderConfig: { devicePixelRatio: SPRITE_DPR, autoResize: true },
	});
	// Pause on the SECOND frame event, not a rAF after play(): the worker
	// round-trips play/pause asynchronously, so a rAF-timed pause can land
	// before any frame was drawn and leave the canvas permanently blank (the
	// occasionally-missing preview fish). By frame 2 the first frame is
	// guaranteed painted; one extra frame is imperceptible.
	let frameCount = 0;
	player.addEventListener("frame", () => {
		if (hasFrame) return;
		frameCount += 1;
		if (frameCount < 2) return;
		hasFrame = true;
		if (!active) {
			try {
				player.pause();
			} catch {
				/* torn down */
			}
		}
	});
	// Always render at least one frame so paused canvases aren't blank; the
	// render handler above immediately re-pauses inactive ones.
	player.addEventListener("load", () => {
		loaded = true;
		try {
			player.play();
		} catch {
			/* torn down */
		}
	});
	return {
		setActive(next: boolean) {
			if (active === next) return;
			active = next;
			if (!loaded) return;
			try {
				// Before the first frame exists the render handler owns pausing.
				if (next) player.play();
				else if (hasFrame) player.pause();
			} catch {
				/* torn down */
			}
		},
		destroy() {
			try {
				player.destroy();
			} catch {
				/* already gone */
			}
		},
	};
}

// ── Entry point ─────────────────────────────────────────────────────────────

export function acquireSprite(opts: AcquireSpriteOptions): SpriteHandle {
	if (opts.frozen) return acquireFrozen(opts);
	return isNativePlatform ? acquirePooled(opts) : acquireWorker(opts);
}
