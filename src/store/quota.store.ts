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
	const mates = computed<QuotaState>(() => summary.value?.mates ?? EMPTY_STATE);

	const canSendBalloon = computed(() =>
		summary.value ? balloons.value.remaining > 0 : true,
	);
	const canCreatePost = computed(() =>
		summary.value ? posts.value.remaining > 0 : true,
	);
	// `limit === null` is the unlimited (Pro) tier — no weekly cap on new mates.
	const canAddMate = computed(() =>
		summary.value
			? mates.value.limit === null || mates.value.remaining > 0
			: true,
	);
	/** True only for a capped tier that has run out — drives the paywall nudge. */
	const mateWeeklyLimitReached = computed(
		() => !!summary.value && mates.value.limit !== null && mates.value.remaining <= 0,
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
	 * `limit === null` means unlimited (only mates use it today, but the field is
	 * shared) — there is nothing to count down against, so leave `remaining`
	 * alone rather than computing `null - used`.
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

	return {
		summary,
		isPro,
		balloons,
		posts,
		mates,
		canSendBalloon,
		canCreatePost,
		canAddMate,
		mateWeeklyLimitReached,
		isLoading,
		refresh,
		decrementBalloon,
		decrementPost,
		incrementBalloon,
	};
});
