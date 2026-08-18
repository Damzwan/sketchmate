import { useIntersectionObserver } from "@vueuse/core";
import { onUnmounted } from "vue";
import { logPostViews } from "@/service/api/post.api";
import { usePostStore } from "@/store/post.store";

export function usePostViewTracking() {
	const postStore = usePostStore();
	const pending = new Set<string>();
	const elements = new Map<string, HTMLElement>();
	const observers = new Map<
		string,
		{ stop: () => void; timer: ReturnType<typeof setTimeout> | null }
	>();
	let syncTimer: ReturnType<typeof setTimeout> | null = null;

	async function flushViews() {
		if (syncTimer) clearTimeout(syncTimer);
		syncTimer = null;
		if (!pending.size) return;
		const ids = [...pending];
		pending.clear();
		try {
			await logPostViews(ids);
		} catch (error) {
			console.error("View sync failed", error);
		}
	}

	function scheduleSync() {
		if (!syncTimer) syncTimer = setTimeout(() => void flushViews(), 3000);
	}

	function stopPostObserver(postId: string) {
		const observer = observers.get(postId);
		if (observer?.timer) clearTimeout(observer.timer);
		observer?.stop();
		observers.delete(postId);
		elements.delete(postId);
	}

	function stopAllPostObservers() {
		for (const postId of [...observers.keys()]) stopPostObserver(postId);
	}

	function registerPostRef(element: any, postId: string) {
		if (!element) {
			stopPostObserver(postId);
			return;
		}
		const target =
			element.$el instanceof HTMLElement
				? element.$el
				: element instanceof HTMLElement
					? element
					: null;
		if (!target || elements.has(postId)) return;

		elements.set(postId, target);
		let timer: ReturnType<typeof setTimeout> | null = null;
		const { stop } = useIntersectionObserver(
			target,
			([{ isIntersecting }]) => {
				if (postStore.hasViewedFeedPost(postId)) {
					stopPostObserver(postId);
					return;
				}
				if (isIntersecting && !timer) {
					timer = setTimeout(() => {
						if (postStore.markFeedPostViewed(postId)) {
							pending.add(postId);
							scheduleSync();
						}
						stopPostObserver(postId);
					}, 1500);
					const observer = observers.get(postId);
					if (observer) observer.timer = timer;
				} else if (timer) {
					clearTimeout(timer);
					timer = null;
					const observer = observers.get(postId);
					if (observer) observer.timer = null;
				}
			},
			{ threshold: 0.6 },
		);
		observers.set(postId, { stop, timer });
	}

	onUnmounted(() => {
		stopAllPostObservers();
		void flushViews();
	});

	return { registerPostRef, stopAllPostObservers };
}
