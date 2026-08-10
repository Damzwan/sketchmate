import {
	computed,
	inject,
	type MaybeRefOrGetter,
	type Ref,
	ref,
	toValue,
	watch,
} from "vue";
import {
	AMBIENT_FOREGROUND,
	useAmbientPause,
} from "@/store/ambientPause.store";

/**
 * How far outside the viewport an ambient layer should already be live.
 *
 * `hero` keeps the profile card's world warm well before it scrolls in — there
 * is only ever one. `nearby` is for LIST instances (feed cards, chat rows, shop
 * tiles): a 20-item feed must not spin up 20 scenes up front, so only roughly a
 * screen ahead ever starts animating.
 */
export const AMBIENT_MARGIN = {
	hero: "9999px",
	nearby: "300px",
} as const;

/**
 * One IntersectionObserver per root margin, shared by every ambient layer.
 *
 * Each card in a feed carries both a world and an effect, and both watch the
 * same scroller with the same margin — a per-instance observer meant dozens of
 * observers reporting identical geometry. There are only two margins in the
 * app, so this collapses to two observers for the whole process.
 */
const observers = new Map<string, IntersectionObserver>();
const listeners = new WeakMap<Element, (visible: boolean) => void>();

function observerFor(rootMargin: string): IntersectionObserver {
	let io = observers.get(rootMargin);
	if (!io) {
		io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					listeners.get(entry.target)?.(entry.isIntersecting);
				}
			},
			{ rootMargin },
		);
		observers.set(rootMargin, io);
	}
	return io;
}

export interface AmbientVisibility {
	/** Bind to the layer's root element. */
	root: Ref<HTMLElement | null>;
	onScreen: Ref<boolean>;
	/**
	 * Latched: flips true the first time the layer is on-screen and never back.
	 * Scenes stay in the DOM once mounted so scrolling back to a card replays
	 * instead of re-creating canvases (that re-mount was the pop-in flicker);
	 * playback is governed by `paused` instead.
	 */
	hasMounted: Ref<boolean>;
	/** Off-screen, behind an overlay, or frozen by the caller. */
	paused: Ref<boolean>;
}

export interface AmbientVisibilityOptions {
	rootMargin: MaybeRefOrGetter<string>;
	/** An instance-level reason to never animate (static tiles, weak devices). */
	frozen?: MaybeRefOrGetter<boolean>;
}

/**
 * Viewport gating + global pause for the ambient customization layers
 * (ProfileWorld scenes, ProfileEffect sheets).
 */
export function useAmbientVisibility(
	options: AmbientVisibilityOptions,
): AmbientVisibility {
	const root = ref<HTMLElement | null>(null);
	const onScreen = ref(false);
	const hasMounted = ref(false);

	const ambient = useAmbientPause();
	// Foreground subtrees (inside the shop / a preview modal) ignore the global
	// overlay pause — they ARE the overlay's content and must keep animating.
	const foreground = inject(AMBIENT_FOREGROUND, false);

	if (typeof IntersectionObserver === "undefined") {
		onScreen.value = true;
		hasMounted.value = true;
	} else {
		watch(
			root,
			(el, _previous, onCleanup) => {
				if (!el) return;
				const io = observerFor(toValue(options.rootMargin));
				listeners.set(el, (visible) => {
					onScreen.value = visible;
					if (visible) hasMounted.value = true;
				});
				io.observe(el);
				onCleanup(() => {
					io.unobserve(el);
					listeners.delete(el);
				});
			},
			{ immediate: true, flush: "post" },
		);
	}

	const paused = computed(
		() =>
			toValue(options.frozen) === true ||
			!onScreen.value ||
			(!toValue(foreground) && ambient.paused),
	);

	return { root, onScreen, hasMounted, paused };
}
