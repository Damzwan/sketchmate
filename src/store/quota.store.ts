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
	const canAddMate = computed(() =>
		summary.value ? mates.value.remaining > 0 : true,
	);

	async function refresh(force = false): Promise<void> {
		if (!force && Date.now() - lastFetchedAt.value < 5_000) return;
		isLoading.value = true;
		try {
			const x = await fetchQuotaSummary();
			summary.value = x;
			lastFetchedAt.value = Date.now();
		} catch (e) {
			console.error("Failed to fetch quota summary:", e);
		} finally {
			isLoading.value = false;
		}
	}

	function decrementBalloon() {
		if (!summary.value) return;
		const s = summary.value.balloons;
		s.used = Math.min(s.limit, s.used + 1);
		s.remaining = Math.max(0, s.limit - s.used);
	}

	function incrementBalloon() {
		if (!summary.value) return;
		const s = summary.value.balloons;
		s.used = Math.max(0, s.used - 1);
		s.remaining = Math.max(0, s.limit - s.used);
	}

	function decrementPost() {
		if (!summary.value) return;
		const s = summary.value.posts;
		s.used = Math.min(s.limit, s.used + 1);
		s.remaining = Math.max(0, s.limit - s.used);
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
		isLoading,
		refresh,
		decrementBalloon,
		decrementPost,
		incrementBalloon,
	};
});
