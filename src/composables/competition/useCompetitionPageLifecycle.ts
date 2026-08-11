import { onIonViewDidEnter, onIonViewDidLeave } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { formatRemaining, phaseFor } from "@/config/competition.config";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useAmbientPause } from "@/store/ambientPause.store";
import { useAuthStore } from "@/store/auth.store";
import { useCompetitionStore } from "@/store/competition.store";

export function useCompetitionPageLifecycle() {
	const auth = useAuthStore();
	const competitionStore = useCompetitionStore();
	const { competition, entries } = storeToRefs(competitionStore);
	const { paused } = storeToRefs(useAmbientPause());
	const now = ref(Date.now());
	const sentinel = ref<HTMLElement | null>(null);
	let ticker: ReturnType<typeof setInterval> | null = null;
	let observer: IntersectionObserver | null = null;
	let refreshingBoundary = false;

	const countdown = computed(() => {
		if (!competitionStore.deadline || competitionStore.phase === "announced") {
			return "Complete";
		}
		return formatRemaining(competitionStore.deadline, now.value);
	});

	function startTicker() {
		if (ticker || paused.value) return;
		ticker = setInterval(() => {
			now.value = Date.now();
			const current = competition.value;
			if (
				!refreshingBoundary &&
				current &&
				phaseFor(current, now.value) !== competitionStore.phase
			) {
				refreshingBoundary = true;
				void competitionStore.refresh(true).finally(() => {
					refreshingBoundary = false;
				});
			}
		}, 1000);
	}

	function stopTicker() {
		if (ticker) clearInterval(ticker);
		ticker = null;
	}

	function pageSize() {
		if (typeof window === "undefined") return 24;
		if (window.innerWidth >= 1536) return 36;
		if (window.innerWidth >= 1280) return 30;
		if (window.innerWidth >= 1024) return 24;
		if (window.innerWidth >= 640) return 18;
		return 12;
	}

	function attachObserver() {
		observer?.disconnect();
		if (!sentinel.value) return;
		observer = new IntersectionObserver(
			(records) => {
				if (records[0]?.isIntersecting) {
					void competitionStore.loadEntries(false, pageSize());
				}
			},
			{ rootMargin: "400px 0px" },
		);
		observer.observe(sentinel.value);
	}

	watch(paused, (isPaused) => (isPaused ? stopTicker() : startTicker()));
	watch(sentinel, attachObserver);

	onIonViewDidEnter(async () => {
		startTicker();
		await auth.waitUntilInitialized();
		if (!auth.isLoggedIn) return;
		await competitionStore.refresh();
		trackEvent(mixpanelEvents.competitionPageOpen, {
			phase: competitionStore.phase,
			entered: competitionStore.hasEntered,
		});
		if (competitionStore.competition && entries.value.length === 0) {
			await competitionStore.loadEntries(true, pageSize());
		}
		attachObserver();
	});

	function stopPageWork() {
		stopTicker();
		refreshingBoundary = false;
		observer?.disconnect();
		competitionStore.flushImpressions();
	}

	onIonViewDidLeave(stopPageWork);
	onBeforeUnmount(stopPageWork);

	return { countdown, sentinel };
}
