import {
	type InjectionKey,
	inject,
	onBeforeUnmount,
	type Ref,
	watch,
} from "vue";
import {
	acquireSprite,
	type SpriteHandle,
} from "@/helper/lottie_sprite.helper";
import { type SpriteSpec, spritePx } from "./world_sprites";

/**
 * What ProfileWorld tells the individual scene components about the surface
 * they are painting on. Provided once by the shell; consumed via
 * `useWorldStage()`.
 */
export interface WorldStage {
	/** Playback is frozen right now (off-screen, or behind an overlay). */
	paused: Ref<boolean>;
	/** This instance renders ONE lottie frame and holds it — never a player. */
	freezeFrame: Ref<boolean>;
	/** Sprites hold fixed positions instead of travelling (feed/list minis). */
	staticMode: Ref<boolean>;
	/** Show fewer sprites: small preview tiles and weak devices. */
	reduced: Ref<boolean>;
}

export const WORLD_STAGE: InjectionKey<WorldStage> = Symbol("world-stage");

const NO_STAGE_ERROR =
	"useWorldStage() must be called inside a <ProfileWorld> scene";

/**
 * Scene-side half of the stage contract: reads the shell's run-state and owns
 * the sprite canvases this one scene mounted.
 *
 * Sprite lifetime is deliberately per-SCENE rather than per-ProfileWorld.
 * Switching world kind unmounts the whole scene, so its players are released
 * here on unmount — the shell used to have to sweep for orphaned canvases after
 * every kind change to catch the same leak.
 */
export function useWorldStage() {
	const stage = inject(WORLD_STAGE);
	if (!stage) throw new Error(NO_STAGE_ERROR);

	const handles = new Set<SpriteHandle>();

	/**
	 * Attach a canvas to the shared sprite pool.
	 *
	 * On native the pool decodes each sprite TYPE once into a hidden master
	 * canvas and fans frames out with cheap drawImage blits (Android WebView
	 * can't run DotLottieWorker — no rAF inside a Worker, so it freezes on frame
	 * 0). On web each canvas keeps its own worker, fully off the main thread.
	 */
	const bind = (el: unknown, spec: SpriteSpec) => {
		const canvas = el as (HTMLCanvasElement & { _spriteBound?: true }) | null;
		// The :ref callback can fire repeatedly for the same element; bind once.
		if (!canvas || canvas._spriteBound) return;
		canvas._spriteBound = true;

		handles.add(
			acquireSprite({
				canvas,
				src: spec.src,
				// Frozen-ness is decided once at bind: either the sprite type never
				// animates its own frames, or the whole world is a freeze-frame.
				frozen: spec.frozen || stage.freezeFrame.value,
				active: !stage.paused.value,
				masterSize: spritePx(spec.maxRem),
			}),
		);
	};

	/** Trim a scene's sprite list on preview tiles and weak devices. */
	const cap = <T>(list: T[], reducedCount: number): T[] =>
		stage.reduced.value ? list.slice(0, reducedCount) : list;

	watch(stage.paused, (paused) => {
		for (const handle of handles) handle.setActive(!paused);
	});

	onBeforeUnmount(() => {
		for (const handle of handles) handle.destroy();
		handles.clear();
	});

	return { bind, cap, staticMode: stage.staticMode };
}
