<template>
  <div class="cabin-sketch-regular">
    <p class="text-sm font-bold text-black/70 text-center leading-snug px-2">
      The most voted idea becomes next week's theme.
    </p>

    <!-- ── Suggest ───────────────────────────────────────────────────────── -->
    <div class="mt-4 rounded-[1.5rem] border border-primary/30 bg-tertiary p-3.5">
      <template v-if="canSuggest">
        <div class="relative">
          <input
            v-model="draft"
            type="text"
            :maxlength="MAX_THEME_LENGTH"
            placeholder="Suggest a theme"
            class="w-full bg-background border-2 rounded-2xl pl-4 pr-14 py-3 text-[15px] font-black text-black outline-none transition-colors placeholder:font-bold placeholder:text-black/35"
            :class="draft.trim() ? 'border-secondary' : 'border-transparent'"
            @keyup.enter="submit"
          />
          <span
            class="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-black tabular-nums"
            :class="remaining <= 10 ? 'text-red-600' : 'text-black/35'"
          >
            {{ remaining }}
          </span>
        </div>

        <button
          type="button"
          class="mt-2.5 w-full h-11 rounded-2xl bg-secondary text-white text-[15px] font-black cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.01] md:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-35 disabled:scale-100"
          :disabled="busy || draft.trim().length < 4"
          @click="submit"
        >
          {{ busy ? 'Sending…' : 'Suggest' }}
        </button>
        <p class="text-[11px] font-bold text-black/50 mt-2 text-center">
          One idea per competition. Reviewed before it reaches the vote.
        </p>
      </template>

      <div v-else class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-full bg-secondary/15 text-secondary flex items-center justify-center shrink-0">
          <ion-icon :icon="svg(mdiCheck)" class="text-lg" />
        </div>
        <p class="text-[13px] font-bold text-black/70 leading-snug">
          Your idea is in. You can suggest again next competition.
        </p>
      </div>
    </div>

    <!-- ── Your suggestion ───────────────────────────────────────────────── -->
    <div v-if="myPending.length" class="mt-3 space-y-2">
      <div
        v-for="theme in myPending"
        :key="theme._id"
        class="rounded-[1.25rem] border bg-tertiary px-3.5 py-3"
        :class="theme.status === 'rejected' ? 'border-red-200' : 'border-primary/30'"
      >
        <div class="flex items-center justify-between gap-2.5">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-widest text-black/50">
              Your suggestion
            </p>
            <p class="text-[15px] font-black text-black truncate mt-0.5">{{ theme.text }}</p>
          </div>
          <span
            class="shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide border"
            :class="theme.status === 'rejected'
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-secondary/10 text-secondary border-secondary/25'"
          >
            {{ theme.status === 'rejected' ? 'Not selected' : 'In review' }}
          </span>
        </div>

        <p v-if="theme.status === 'rejected' && theme.rejected_reason" class="text-[11px] font-bold text-red-700/80 mt-1.5">
          {{ theme.rejected_reason }}
        </p>

        <button
          v-if="theme.status === 'pending'"
          type="button"
          class="mt-2.5 w-full h-9 rounded-xl border border-primary/30 bg-background text-[12px] font-black text-black/70 cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.01] disabled:opacity-40"
          :disabled="busy"
          @click="cancelSuggestion(theme)"
        >
          Withdraw
        </button>
      </div>
    </div>

    <!-- ── Community vote ────────────────────────────────────────────────── -->
    <div class="mt-6 flex items-end justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-lg font-black text-black leading-none">In the running</h3>
        <p class="text-[11px] font-bold text-black/50 mt-1">
          {{ totalVotes }} {{ totalVotes === 1 ? 'vote' : 'votes' }} so far
        </p>
      </div>
      <input
        v-if="themes.length > 8"
        v-model="search"
        type="search"
        placeholder="Search"
        class="w-28 shrink-0 bg-tertiary border border-primary/30 rounded-xl px-3 py-2 text-xs font-bold text-black outline-none placeholder:text-black/40"
      />
    </div>

    <div v-if="isLoading" class="mt-3 space-y-2">
      <div v-for="n in 4" :key="n" class="h-14 rounded-[1.25rem] bg-primary/10 animate-pulse" />
    </div>

    <ul v-else-if="sortedThemes.length" class="mt-3 space-y-2">
      <li v-for="(theme, index) in sortedThemes" :key="theme._id">
        <button
          type="button"
          class="relative w-full overflow-hidden flex items-center gap-3 rounded-[1.25rem] border-2 bg-tertiary px-3 py-2.5 text-left cursor-pointer transition-all active:scale-[0.99] md:hover:scale-[1.01] md:hover:shadow-sm"
          :class="theme.voted
            ? 'border-secondary'
            : index === 0 ? 'border-secondary/30' : 'border-transparent'"
          @click="toggle(theme)"
        >
          <!-- Vote share as a filled track behind the row. Relative standing is
               the useful signal; the raw number alone doesn't show whether the
               leader is running away with it. -->
          <span
            class="absolute inset-y-0 left-0 pointer-events-none bg-secondary transition-[width] duration-300"
            :class="theme.voted ? 'opacity-20' : 'opacity-[0.08]'"
            :style="{ width: `${share(theme)}%` }"
          />

          <span
            class="relative shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black"
            :class="index === 0 ? 'bg-secondary text-white' : 'bg-secondary/15 text-secondary'"
          >
            {{ index === 0 ? '★' : index + 1 }}
          </span>

          <span class="relative flex-1 min-w-0">
            <span class="block text-[15px] font-black text-black leading-tight line-clamp-2">
              {{ theme.text }}
            </span>
            <span v-if="theme.mine" class="block text-[10px] font-black uppercase tracking-wide text-black/45 mt-0.5">
              Your idea
            </span>
          </span>

          <span
            class="relative shrink-0 w-14 h-11 rounded-xl flex flex-col items-center justify-center leading-none transition-colors"
            :class="theme.voted ? 'bg-secondary text-white' : 'bg-secondary/15 text-secondary'"
          >
            <ion-icon :icon="svg(theme.voted ? mdiCheckBold : mdiChevronUp)" class="text-[15px]" />
            <span class="text-[12px] font-black tabular-nums mt-0.5">{{ theme.upvotes }}</span>
          </span>
        </button>
      </li>
    </ul>

    <div v-else class="mt-3 rounded-[1.5rem] border border-dashed border-primary/45 bg-tertiary px-5 py-9 text-center">
      <ion-icon :icon="svg(mdiLightbulbOutline)" class="text-3xl text-secondary/50" />
      <p class="text-[15px] font-black text-black mt-2">
        {{ search ? 'Nothing matches that' : 'No ideas yet' }}
      </p>
      <p class="text-[12px] font-bold text-black/50 mt-1 leading-snug">
        {{ search ? 'Try a different word.' : 'Suggest the first one.' }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import {
	mdiCheck,
	mdiCheckBold,
	mdiChevronUp,
	mdiLightbulbOutline,
} from "@mdi/js";
import { computed, onMounted, ref } from "vue";
import { MAX_THEME_LENGTH } from "@/config/competition.config";
import { svg } from "@/helper/general.helper";
import {
	type CompetitionTheme,
	cancelThemeSuggestion,
	suggestTheme,
	toggleThemeUpvote,
} from "@/service/api/competition.api";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useToast } from "@/service/toast.service";
import { useCompetitionStore } from "@/store/competition.store";

const store = useCompetitionStore();
const { toast } = useToast();
const themes = ref<CompetitionTheme[]>([]);
const myPending = ref<CompetitionTheme[]>([]);
const canSuggest = ref(false);
const draft = ref("");
const search = ref("");
const busy = ref(false);
const isLoading = ref(true);

const remaining = computed(() => MAX_THEME_LENGTH - draft.value.length);

const sortedThemes = computed(() => {
	const query = search.value.trim().toLocaleLowerCase();
	return themes.value
		.filter((theme) => !query || theme.text.toLocaleLowerCase().includes(query))
		.sort((a, b) => b.upvotes - a.upvotes || a.text.localeCompare(b.text));
});

const totalVotes = computed(() =>
	themes.value.reduce((sum, theme) => sum + theme.upvotes, 0),
);

/** Leader-relative, not total-relative: the point is "how close is this?". */
const topVotes = computed(() =>
	themes.value.reduce((max, theme) => Math.max(max, theme.upvotes), 0),
);

function share(theme: CompetitionTheme): number {
	if (!topVotes.value || !theme.upvotes) return 0;
	// Floor at a visible sliver so a 1-vote idea still reads as "has a vote".
	return Math.max(8, Math.round((theme.upvotes / topVotes.value) * 100));
}

async function load() {
	// Shared with the page's top panel, which already fetched this a moment ago.
	const res = await store.loadThemes();
	if (res) {
		themes.value = res.themes;
		myPending.value = res.my_pending;
		canSuggest.value = res.can_suggest;
	}
	isLoading.value = false;
}

async function submit() {
	const text = draft.value.trim();
	if (text.length < 4 || busy.value) return;

	busy.value = true;
	try {
		const res = await suggestTheme(text);
		myPending.value = [res.theme];
		draft.value = "";
		canSuggest.value = false;
		store.invalidateThemes();
		trackEvent(mixpanelEvents.competitionThemeSuggest, { length: text.length });
		toast("Suggested for the next competition");
	} catch (e) {
		const message = (e as Error).message?.includes("429")
			? "You already suggested a theme for this competition"
			: "Couldn't send that idea";
		toast(message, { color: "danger" });
	} finally {
		busy.value = false;
	}
}

async function cancelSuggestion(theme: CompetitionTheme) {
	if (busy.value || theme.status !== "pending") return;
	busy.value = true;
	try {
		await cancelThemeSuggestion(theme._id);
		myPending.value = myPending.value.filter((item) => item._id !== theme._id);
		canSuggest.value = true;
		store.invalidateThemes();
		toast("Suggestion cancelled");
	} catch {
		toast("Couldn't cancel that suggestion", { color: "danger" });
	} finally {
		busy.value = false;
	}
}

async function toggle(theme: CompetitionTheme) {
	const wasVoted = theme.voted;
	theme.voted = !wasVoted;
	theme.upvotes += wasVoted ? -1 : 1;

	try {
		const res = await toggleThemeUpvote(theme._id);
		theme.voted = res.voted;
		store.invalidateThemes();
		trackEvent(mixpanelEvents.competitionThemeUpvote, { voted: res.voted });
	} catch {
		theme.voted = wasVoted;
		theme.upvotes += wasVoted ? 1 : -1;
		toast("Couldn't register that vote", { color: "danger" });
	}
}

onMounted(load);
</script>
