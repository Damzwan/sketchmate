import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { fetchQuotaSummary } from "@/service/api/quota.api";
import { QuotaState, QuotaSummary } from "@/types/server.types";
import { useSubscriptionStore } from "@/store/subscription.store";

const EMPTY_STATE: QuotaState = {
	used: 0,
	limit: 0,
	remaining: 0,
	reset_at: new Date().toISOString(),
};

export const useQuotaStore = defineStore("quota", () => {
	const summary = ref<QuotaSummary | null>(null);
	const isLoading = ref(false);
	const lastFetchedAt = ref<number>(0);
	const subscriptionStore = useSubscriptionStore();

	const isPro = computed(() => subscriptionStore.isPro);

	const balloons = computed<QuotaState>(
		() => summary.value?.balloons ?? EMPTY_STATE,
	);
	const posts = computed<QuotaState>(() => summary.value?.posts ?? EMPTY_STATE);

	const canSendBalloon = computed(() =>
		summary.value ? balloons.value.remaining > 0 : true,
	);
	const canCreatePost = computed(() =>
		summary.value ? posts.value.remaining > 0 : true,
	);

	async function refresh(force = false): Promise<void> {
		if (!force && Date.now() - lastFetchedAt.value < 5_000) return;
		isLoading.value = true;
		try {
			summary.value = await fetchQuotaSummary();
			lastFetchedAt.value = Date.now();
		} catch (e) {
			console.error("Failed to fetch quota summary:", e);
		} finally {
			isLoading.value = false;
		}
	}

	/**
	 * Re-derive `remaining` after a local `used` nudge.
	 *
	 * Re-derive the remaining daily allowance after a local usage nudge.
	 */
	function syncRemaining(s: QuotaState) {
		if (s.limit === null) return;
		s.used = Math.min(s.limit, Math.max(0, s.used));
		s.remaining = Math.max(0, s.limit - s.used);
	}

	function decrementBalloon() {
		if (!summary.value) return;
		const s = summary.value.balloons;
		s.used += 1;
		syncRemaining(s);
	}

	function incrementBalloon() {
		if (!summary.value) return;
		const s = summary.value.balloons;
		s.used -= 1;
		syncRemaining(s);
	}

	function decrementPost() {
		if (!summary.value) return;
		const s = summary.value.posts;
		s.used += 1;
		syncRemaining(s);
	}

	/** Replace the optimistic post count with the server's authoritative state. */
	async function syncPostQuota(state?: QuotaState): Promise<QuotaState> {
		if (state && summary.value) {
			summary.value.posts = state;
			lastFetchedAt.value = Date.now();
		} else {
			// Supports a staggered deploy against an older server response and the
			// rare case where auth has not hydrated the quota summary yet.
			await refresh(true);
		}

		return posts.value;
	}

	return {
		summary,
		isPro,
		balloons,
		posts,
		canSendBalloon,
		canCreatePost,
		isLoading,
		refresh,
		decrementBalloon,
		decrementPost,
		syncPostQuota,
		incrementBalloon,
	};
});
