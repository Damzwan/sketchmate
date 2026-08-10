import astronaut from "@/assets/lottie/avatar/astronaut.lottie";
import autumn_leaves from "@/assets/lottie/avatar/autumn_leaves.lottie";
import catLottie from "@/assets/lottie/avatar/cat.lottie";
import dragon from "@/assets/lottie/avatar/dragon.lottie";
import fire from "@/assets/lottie/avatar/fire.lottie";
import fishLottie from "@/assets/lottie/avatar/fish.lottie";
import jellyFishLottie from "@/assets/lottie/avatar/jellyfish.lottie";
import meteor from "@/assets/lottie/avatar/meteor.lottie";
import moon from "@/assets/lottie/avatar/moon.lottie";
import mushroom_walking from "@/assets/lottie/avatar/mushroom.lottie";
import plantLottie from "@/assets/lottie/avatar/plant.lottie";
import rocket from "@/assets/lottie/avatar/rocket.lottie";
import turtleLottie from "@/assets/lottie/avatar/turtle.lottie";
import {
	prefetchSprite,
	SPRITE_DPR,
	warmFrozenFrame,
} from "@/helper/lottie_sprite.helper";

/**
 * Per-type sprite spec: source + the largest on-screen size that type is ever
 * drawn at (which sets the master/snapshot resolution) + whether its own frames
 * ever need to advance.
 */
export interface SpriteSpec {
	src: string;
	maxRem: number;
	frozen?: boolean;
}

export const spritePx = (rem: number) => Math.round(rem * 16 * SPRITE_DPR);

export const SPRITES = {
	jellyfish: { src: jellyFishLottie, maxRem: 6 },
	turtle: { src: turtleLottie, maxRem: 7.2 },
	fish: { src: fishLottie, maxRem: 4 },
	cat: { src: catLottie, maxRem: 8 },
	// Sway/tumble/streak/bob/wander all come from CSS transforms — a frozen
	// frame reads identical in motion, so these never pay for a player.
	plant: { src: plantLottie, maxRem: 5, frozen: true },
	leaves: { src: autumn_leaves, maxRem: 13.5, frozen: true },
	mushroom: { src: mushroom_walking, maxRem: 8.5 },
	fire: { src: fire, maxRem: 8 },
	dragon: { src: dragon, maxRem: 18 },
	// NOT frozen: the meteor asset is a sparse thin streak on every single
	// frame (~0.5% of its box) — its visible life IS the animated trail.
	meteor: { src: meteor, maxRem: 13 },
	moon: { src: moon, maxRem: 6, frozen: true },
	rocket: { src: rocket, maxRem: 7 },
	astronaut: { src: astronaut, maxRem: 5, frozen: true },
} satisfies Record<string, SpriteSpec>;

/**
 * Weak phones, as stamped on <html> by main.ts. Read lazily and memoised: this
 * module can be imported before main.ts has run its capability checks, so a
 * module-scope read would latch `false` on every device.
 *
 * Two mitigations hang off it — fewer sprites (`reduced`) and a freeze-frame
 * lottie mode (`freezeFrame`).
 */
let lowEnd: boolean | undefined;
export const isLowEndDevice = (): boolean =>
	(lowEnd ??=
		typeof document !== "undefined" &&
		document.documentElement.classList.contains("low-end"));

/**
 * Warm the sprite pipeline once, off the critical path: pre-decode the
 * always-frozen snapshots (shop tiles/previews then stamp instantly instead of
 * popping in after a load+decode round-trip) and prime the HTTP cache for the
 * animated ones so their players load from cache when a preview mounts.
 *
 * Skipped entirely on low-end devices, which render a single frozen frame and a
 * reduced sprite count anyway — warming there decoded the FULL sprite set on
 * exactly the phones that could least afford it, while the first profile view
 * was still laying out.
 */
let warmed = false;
export function warmSprites(): void {
	if (warmed || isLowEndDevice()) return;
	warmed = true;

	const kick = () => {
		for (const spec of Object.values(SPRITES) as SpriteSpec[]) {
			if (spec.frozen) warmFrozenFrame(spec.src, spritePx(spec.maxRem));
			else prefetchSprite(spec.src);
		}
	};

	// No timeout: on a device that never goes idle this should never run.
	if ("requestIdleCallback" in window) requestIdleCallback(kick);
	else setTimeout(kick, 300);
}
