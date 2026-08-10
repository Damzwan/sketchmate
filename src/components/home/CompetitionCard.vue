<template>
  <!-- Top slot on the home screen. Renders nothing at all when there is no
       competition, so a quiet week costs the home screen no space. -->
  <section v-if="show">
    <!-- Under 13: the competition is a public stranger surface, so the card
         explains rather than teases. Same treatment as AgeGatedBanner. -->
    <div
      v-if="isUnderAge"
      class="rounded-3xl border border-amber-200 bg-amber-50 p-4 flex gap-3"
    >
      <ion-icon :icon="svg(mdiTrophyOutline)" class="text-2xl shrink-0 text-amber-600" />
      <div class="flex-1 min-w-0">
        <p class="font-black text-base text-amber-900 leading-tight">
          The weekly competition unlocks at 13
        </p>
        <p class="text-sm text-amber-900/90 mt-1 leading-snug">
          It's a public gallery where anyone can see your drawing, so it waits until you're older.
        </p>
      </div>
    </div>

    <!-- First-ever load only: after that the localStorage card cache means the
         real card paints on frame one. This is the card's own silhouette in the
         accent gradient rather than a grey slab, so the fetch resolving is a
         text swap instead of a block turning into a card. -->
    <div
      v-else-if="!store.cardReady"
      class="rounded-3xl p-4 border shadow-sm relative overflow-hidden"
      :style="cardStyle"
      aria-busy="true"
    >
      <div class="absolute -top-10 -right-8 w-32 h-32 rounded-full bg-white/25 blur-3xl pointer-events-none" />
      <div class="relative flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="h-2.5 w-24 rounded-full bg-white/45 shimmer" />
          <div class="h-5 w-4/5 rounded-lg bg-white/50 mt-2.5 shimmer" />
          <div class="h-3.5 w-1/2 rounded-md bg-white/35 mt-2.5 shimmer" />
          <div class="h-7 w-28 rounded-full bg-white/40 mt-3 shimmer" />
        </div>
        <div class="w-12 h-14 flex items-center justify-center shrink-0 opacity-35">
          <ion-icon :icon="svg(mdiTrophyOutline)" class="text-4xl" />
        </div>
      </div>
    </div>

    <button
      v-else
      type="button"
      class="w-full text-left rounded-3xl p-4 border shadow-sm cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.015] md:hover:shadow-md relative overflow-hidden"
      :style="cardStyle"
      @click="open"
    >
      <!-- Soft corner glow, same trick as WhatsNewModal -->
      <div class="absolute -top-10 -right-8 w-32 h-32 rounded-full bg-white/25 blur-3xl pointer-events-none" />

      <div class="relative flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <p class="text-[11px] font-black uppercase tracking-widest">
            {{ eyebrow }}
          </p>

          <h2 class="text-xl font-black leading-tight mt-1 line-clamp-2">
            {{ headline }}
          </h2>

          <!-- No opacity on ink over the accent gradient: fading it blends the
               ink toward the background and costs ~0.5 of contrast ratio, which
               put every accent under AA on the gradient's darker corner. -->
          <p class="text-sm font-bold mt-1.5 leading-snug">
            {{ subline }}
          </p>

          <div class="flex items-center gap-2 mt-3">
            <span class="px-2.5 py-1 rounded-full bg-white/40 text-xs font-black">
              {{ cta }}
            </span>
            <span v-if="rewardsAvailable" class="text-xs font-black">
              Win rewards
            </span>
          </div>
        </div>

        <div class="w-12 h-14 flex items-center justify-center shrink-0 opacity-80">
          <ion-icon :icon="svg(mdiTrophyOutline)" class="text-4xl" />
        </div>
      </div>
    </button>
  </section>
</template>

<script setup lang="ts">
import { IonIcon, useIonRouter } from "@ionic/vue";
import { mdiTrophyOutline } from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
	formatRemaining,
	phaseFor,
	resolveAccent,
} from "@/config/competition.config";
import { masterAnimation } from "@/helper/animation.helper";
import { svg } from "@/helper/general.helper";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useAmbientPause } from "@/store/ambientPause.store";
import { useAuthStore } from "@/store/auth.store";
import { useCompetitionStore } from "@/store/competition.store";
import { useMenuStore } from "@/store/menu.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

const r = useIonRouter();
const store = useCompetitionStore();
const menuStore = useMenuStore();
const { isUnderAge } = storeToRefs(useAuthStore());
const { paused } = storeToRefs(useAmbientPause());

const show = computed(
	() => isUnderAge.value || !store.cardReady || !!store.competition,
);

const accentColors = computed(() => resolveAccent(store.accent));

const cardStyle = computed(() => {
	const a = accentColors.value;
	return {
		background: `linear-gradient(135deg, ${a.from} 0%, ${a.to} 100%)`,
		borderColor: `${a.ink}33`,
		color: a.ink,
	};
});

const displayPhase = computed(() =>
	store.competition ? phaseFor(store.competition, now.value) : null,
);

// ── Copy per state ─────────────────────────────────────────────────────────
const eyebrow = computed(() => {
	switch (displayPhase.value) {
		case "announced":
			return store.hasUnseenResults ? "Results are in" : "Last week";
		case "voting":
			return "Voting — submissions closed";
		case "closed":
			return "Votes are being counted";
		case "open":
			return store.hasEntered ? "You're in" : "This week's theme";
		case "scheduled":
			return "Next competition";
		default:
			return "Starting soon";
	}
});

const headline = computed(() => {
	if (displayPhase.value === "announced" && store.myEntry?.is_winner) {
		return "You won this week";
	}
	return store.competition?.theme ?? "";
});

const subline = computed(() => {
	if (!store.competition) return "";

	if (displayPhase.value === "announced") {
		return store.hasUnseenResults
			? "See who won and what they got."
			: "A new theme opens Monday.";
	}
	if (displayPhase.value === "closed")
		return "Results will be announced shortly.";
	if (displayPhase.value === "scheduled") {
		const remaining = formatRemaining(store.competition.starts_at, now.value);
		return `${remaining} until entries open · Win rewards`;
	}

	const deadline =
		displayPhase.value === "open"
			? store.competition.submissions_close_at
			: store.competition.ends_at;
	const remaining = deadline ? formatRemaining(deadline, now.value) : "";
	const count = store.competition.entry_count;
	const entries = `${count} ${count === 1 ? "entry" : "entries"}`;

	if (displayPhase.value === "voting")
		return `${remaining} of voting left · ${entries}`;
	return `${remaining} to enter · ${entries}`;
});

const cta = computed(() => {
	if (displayPhase.value === "announced") {
		return store.hasUnseenResults ? "See the winners" : "See the results";
	}
	if (displayPhase.value === "voting") return "Vote now";
	if (displayPhase.value === "closed") return "See the entries";
	if (displayPhase.value === "scheduled") return "See what's coming";
	return store.hasEntered ? "See the entries" : "Draw your entry";
});

const rewardsAvailable = computed(
	() =>
		displayPhase.value !== "announced" &&
		!!store.competition?.categories.some(
			(category) => category.reward_items.length > 0,
		),
);

// ── Countdown ──────────────────────────────────────────────────────────────
// One interval for the card, and it stops while the app is backgrounded —
// a 1s tick that survives into the background is a battery bug, not a feature.
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
let observedPhase = displayPhase.value;
let lastClosedRefresh = 0;

function updateClock() {
	now.value = Date.now();
	const nextPhase = store.competition
		? phaseFor(store.competition, now.value)
		: null;
	const crossedBoundary = nextPhase !== observedPhase;
	observedPhase = nextPhase;
	if (crossedBoundary) void store.refresh();
	if (nextPhase === "closed" && now.value - lastClosedRefresh >= 60_000) {
		lastClosedRefresh = now.value;
		void store.refresh();
	}
}

function startTicker() {
	if (ticker || paused.value) return;
	updateClock();
	ticker = setInterval(updateClock, 1000);
}

function stopTicker() {
	if (ticker) clearInterval(ticker);
	ticker = null;
}

// A big overlay (shop, paywall, what's-new) means the card is not visible;
// a 1s tick behind it is pure battery burn.
watch(paused, (isPaused) => (isPaused ? stopTicker() : startTicker()));
watch(
	() => store.competition?._id,
	() => {
		observedPhase = displayPhase.value;
		lastClosedRefresh = 0;
	},
);

onMounted(startTicker);
onBeforeUnmount(stopTicker);

function open() {
	trackEvent(mixpanelEvents.competitionCardOpen, {
		phase: displayPhase.value,
		entered: store.hasEntered,
	});

	// Results the user hasn't seen belong in the moment, not the grid.
	if (store.hasUnseenResults) {
		store.targetResults();
		menuStore.isCompetitionResultsOpen = true;
		return;
	}

	r.push(`/${FRONTEND_ROUTES.competition}`, masterAnimation);
}
</script>

<style scoped>
/* Sweep rather than opacity-pulse: a pulsing block reads as "broken", a sweep
   reads as "loading". Transform-only, so it stays on the compositor. */
.shimmer {
  position: relative;
  overflow: hidden;
}
.shimmer::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.55), transparent);
  animation: competition-shimmer 1.4s ease-in-out infinite;
}
@keyframes competition-shimmer {
  to { transform: translateX(100%); }
}
@media (prefers-reduced-motion: reduce) {
  .shimmer::after { animation: none; }
}
</style>
