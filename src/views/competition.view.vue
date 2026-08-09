<template>
  <ion-page class="slide-page">
    <SubPageBar title="Competition" />

    <ion-content class="--background-custom">
      <div ref="rootEl" class="pb-16 cabin-sketch-regular">
        <header v-if="competition" class="mx-4 mt-4 p-5 rounded-[2rem] border shadow-sm" :style="headerStyle">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="text-[11px] font-black uppercase tracking-widest">{{ phaseLabel }}</p>
              <h1 class="text-xl font-black leading-tight mt-1">{{ competition.theme }}</h1>
              <p v-if="competition.theme_blurb" class="text-sm opacity-90 mt-2 leading-snug">{{ competition.theme_blurb }}</p>
            </div>
            <div class="shrink-0 text-right">
              <p class="text-sm font-black">{{ countdown }}</p>
              <p class="text-[11px] opacity-90 mt-1">{{ competition.entry_count }} entries</p>
            </div>
          </div>
        </header>

        <CompetitionTopPanel
          v-if="competition"
          :accent="competition.accent"
          :can-submit="store.canSubmit"
          :has-entered="store.hasEntered"
          :my-entry="store.myEntry"
          @draw="goDraw"
          @themes="openOverlay(() => (themesOpen = true))"
          @current-entry="openCurrentEntry"
          @archive="openArchive"
        />

        <CompetitionResultsCard v-if="competition" />

        <CompetitionRewards v-if="competition" :categories="competition.categories" />

        <div v-if="!store.hydrated" class="px-4 pt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
          <div v-for="n in 4" :key="n" class="h-56 rounded-3xl bg-primary/10 animate-pulse" />
        </div>

        <div v-else-if="!competition" class="px-6 pt-16 text-center">
          <p class="text-xl font-black text-black">No competition right now</p>
          <p class="text-sm text-black/80 mt-2">A new theme opens every Monday.</p>
        </div>

        <section v-else class="px-4 pt-6">
          <div class="flex items-end justify-between gap-4 mb-3">
            <div>
              <h2 class="text-xl font-black text-black">Entries</h2>
            </div>
            <div class="shrink-0 flex items-center gap-2">
              <span class="text-xs font-black text-black/80">{{ store.totalEntries }}</span>
              <button
                v-if="store.phase !== 'scheduled'"
                type="button"
                class="px-3 py-2 rounded-xl border border-primary/35 bg-tertiary text-xs font-black text-black cursor-pointer transition-all active:scale-95 md:hover:scale-[1.04] md:hover:shadow-sm"
                @click="openOverlay(() => (myVotesOpen = true))"
              >
                Your votes
              </button>
            </div>
          </div>

          <div v-if="store.phase === 'scheduled'" class="rounded-3xl border border-primary/30 bg-tertiary px-6 py-8 text-center">
            <p class="text-lg font-black text-black">Entries open with the competition</p>
            <p class="text-sm font-bold text-black/80 mt-1">Come back when the countdown reaches zero.</p>
          </div>

          <div v-else-if="entries.length === 0 && !store.isLoadingEntries" class="rounded-3xl border border-dashed border-primary/50 bg-tertiary px-6 py-10 text-center">
            <p class="text-lg font-black text-black">{{ store.canSubmit ? 'No entries yet' : 'Nothing was entered' }}</p>
            <button v-if="store.canSubmit" type="button" class="mt-3 px-4 py-2 rounded-full bg-secondary text-white font-black text-sm cursor-pointer transition-all active:scale-95 md:hover:scale-[1.04]" @click="goDraw">
              Start drawing the first entry
            </button>
          </div>

          <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 items-start">
            <EntryCard
              v-for="entry in entries"
              :key="entry._id"
              :entry="entry"
              :categories="competition.categories"
              :accent="competition.accent"
              :is-own-entry="entry.author_id === myId"
              :profanity-filter="profanityFilter"
              @vote="openVoteSheet"
              @comment="openEntryComments"
              @report="onReport"
              @fullscreen="openCompetitionFullscreen"
              @impression="store.trackImpression"
            />
          </div>

          <div ref="sentinel" class="h-3" />
          <div v-if="store.isLoadingEntries" class="flex justify-center py-5">
            <ion-spinner name="dots" color="secondary" />
          </div>
        </section>

        <CompetitionEntrySheet
          :open="!!selectedEntry"
          :entry="selectedEntry"
          :categories="competition?.categories ?? []"
          :accent="competition?.accent ?? 'sunset'"
          :votes-left="store.votesLeft"
          :can-vote="store.canVote"
          :revealed="store.phase === 'announced'"
          :is-own-entry="selectedEntry?.author_id === myId"
          :profanity-filter="profanityFilter"
          @close="closeVoteSheet"
          @vote="onVote"
        />

        <MyCompetitionEntrySheet
          :open="myEntryOpen"
          :entry="currentEntry"
          :can-delete="store.canSubmit"
          @close="closeOverlay(() => (myEntryOpen = false))"
          @delete="deleteCurrentEntry"
          @fullscreen="openCompetitionFullscreen"
          @remix="remixCompetitionEntry"
        />

        <SwiperCommentDrawer
          :open="!!selectedCommentEntry"
          :curr-item="selectedCommentEntry"
          type="competition"
          :user="user"
          @update:open="(open) => { if (!open) closeOverlay(() => (selectedCommentEntry = null)) }"
        />

        <MyCompetitionVotesModal
          :open="myVotesOpen"
          :categories="competition?.categories ?? []"
          @close="closeOverlay(() => (myVotesOpen = false))"
          @select="(entry) => { myVotesOpen = false; selectedEntry = entry }"
        />

        <!-- BaseSheetModal, like every other sheet in the app: same handle, same
             close control, same background. A bespoke ion-modal here meant this
             one sheet had its own cross and its own chrome. -->
        <BaseSheetModal
          :is-open="themesOpen"
          title="Next theme"
          subtitle="Vote or suggest one"
          scrollable
          @close="closeOverlay(() => (themesOpen = false))"
        >
          <!-- Mounted with the sheet, not with the page: ion-modal renders its
               slot into the DOM even while closed, so a bare `v-if="competition"`
               built the whole panel, and fired its themes fetch, on every page
               open whether or not anyone tapped it. -->
          <ThemesPanel v-if="themesOpen" />
        </BaseSheetModal>

        <ArchivedCompetitionModal
          :competition-id="archiveId"
          @close="closeOverlay(() => (archiveId = null))"
        />
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
	alertController,
	IonContent,
	IonPage,
	IonSpinner,
	onIonViewDidEnter,
	onIonViewDidLeave,
	useIonRouter,
} from "@ionic/vue";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import ArchivedCompetitionModal from "@/components/competition/ArchivedCompetitionModal.vue";
import CompetitionEntrySheet from "@/components/competition/CompetitionEntrySheet.vue";
import CompetitionResultsCard from "@/components/competition/CompetitionResultsCard.vue";
import CompetitionRewards from "@/components/competition/CompetitionRewards.vue";
import CompetitionTopPanel from "@/components/competition/CompetitionTopPanel.vue";
import EntryCard from "@/components/competition/EntryCard.vue";
import MyCompetitionEntrySheet from "@/components/competition/MyCompetitionEntrySheet.vue";
import MyCompetitionVotesModal from "@/components/competition/MyCompetitionVotesModal.vue";
import ThemesPanel from "@/components/competition/ThemesPanel.vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import SubPageBar from "@/components/general/SubPageBar.vue";
import SwiperCommentDrawer from "@/components/photoswiper/SwiperCommentDrawer.vue";
import { useOverlayScrollGuard } from "@/composables/general/useOverlayScrollGuard";
import {
	formatRemaining,
	phaseFor,
	resolveAccent,
} from "@/config/competition.config";
import { masterAnimation } from "@/helper/animation.helper";
import {
	ArchivedCompetition,
	CompetitionEntry,
	withdrawEntry,
} from "@/service/api/competition.api";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useToast } from "@/service/toast.service";
import { useAmbientPause } from "@/store/ambientPause.store";
import { useAuthStore } from "@/store/auth.store";
import { useCompetitionStore } from "@/store/competition.store";
import { useMenuStore } from "@/store/menu.store";
import { useModerationStore } from "@/store/moderation.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

const router = useIonRouter();
const store = useCompetitionStore();
const photoSwiper = usePhotoSwiper();
const { competition, entries } = storeToRefs(store);
const authStore = useAuthStore();
const { user } = storeToRefs(authStore);
const { paused: ambientPaused } = storeToRefs(useAmbientPause());
const { toast } = useToast();
const selectedEntry = ref<CompetitionEntry | null>(null);
const selectedCommentEntry = ref<CompetitionEntry | null>(null);
const myVotesOpen = ref(false);
const themesOpen = ref(false);
const archiveId = ref<string | null>(null);
const myEntryOpen = ref(false);
const myId = computed(() => user.value?._id);
const profanityFilter = computed(() => user.value?.profanity_filter ?? true);
const accentColors = computed(() => resolveAccent(competition.value?.accent));

/**
 * The entry grid uses `content-visibility: auto` (see EntryCard), so cards
 * resolve their real height as they re-enter the viewport while an overlay is
 * dismissing — and Ionic restores focus to the card that opened it. Both push
 * the list out from under the user. Same guard the feed uses; every sheet,
 * modal and fullscreen viewer opened from this page goes through it.
 */
const rootEl = ref<HTMLElement | null>(null);
const { captureOverlayScroll, guardScroll, endOverlay } =
	useOverlayScrollGuard(rootEl);

async function openOverlay(present: () => void) {
	await captureOverlayScroll();
	present();
	guardScroll(350);
}

function closeOverlay(dismiss: () => void) {
	dismiss();
	endOverlay();
}

const headerStyle = computed(() => {
	const colors = accentColors.value;
	return {
		background: `linear-gradient(135deg, ${colors.from}, ${colors.to})`,
		borderColor: `${colors.ink}30`,
		color: colors.ink,
	};
});

const phaseLabel = computed(() => {
	switch (store.phase) {
		case "open":
			return "Entries and voting open";
		case "voting":
			return "Voting only";
		case "announced":
			return "Final results";
		case "closed":
			return "Counting votes";
		default:
			return "Starting soon";
	}
});
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
let boundaryRefreshStarted = false;
const countdown = computed(() => {
	if (!store.deadline || store.phase === "announced") return "Complete";
	return formatRemaining(store.deadline, now.value);
});
function startTicker() {
	if (ticker || ambientPaused.value) return;
	ticker = setInterval(() => {
		now.value = Date.now();
		if (
			!boundaryRefreshStarted &&
			competition.value &&
			phaseFor(competition.value, now.value) !== store.phase
		) {
			boundaryRefreshStarted = true;
			void store.refresh(true).finally(() => {
				boundaryRefreshStarted = false;
			});
		}
	}, 1000);
}
function stopTicker() {
	if (ticker) clearInterval(ticker);
	ticker = null;
}

// Same rule as the home card: a 1s countdown behind the shop, the paywall or a
// backgrounded app is battery burn for a number nobody can see.
watch(ambientPaused, (isPaused) => (isPaused ? stopTicker() : startTicker()));

async function onVote(entryId: string, categoryId: string) {
	const entry =
		entries.value.find((candidate) => candidate._id === entryId) ??
		store.myVotedEntries.find((candidate) => candidate._id === entryId);
	const hadVote = entry?.my_votes.includes(categoryId);
	if (!hadVote && store.votesLeftFor(categoryId) <= 0) {
		toast("You have used all votes in this category");
		return;
	}
	if (!(await store.toggleVote(entryId, categoryId))) {
		toast("Couldn't update that vote", { color: "danger" });
	}
}

function openVoteSheet(entry: CompetitionEntry) {
	void openOverlay(() => {
		selectedEntry.value = entry;
	});
}

function closeVoteSheet() {
	closeOverlay(() => {
		selectedEntry.value = null;
	});
}

function openEntryComments(entry: CompetitionEntry) {
	void openOverlay(() => {
		selectedCommentEntry.value = entry;
	});
}

function onReport(entry: CompetitionEntry) {
	void openOverlay(() => {
		useModerationStore().openReport({
			type: "competition_entry",
			id: entry._id,
			label: `${entry.author?.name ?? "An artist"}'s entry`,
			blockUserId: entry.author_id,
		});
	});
}

// The report sheet lives in the menu store, so its dismissal is a state change
// rather than a callback — watch it like any other overlay close.
watch(
	() => useMenuStore().reportMenuOpen,
	(open, wasOpen) => {
		if (wasOpen && !open) endOverlay(450);
	},
);

// The fullscreen viewer closes at will-dismiss, so the list is still animating
// underneath when this fires. Same tail the feed uses.
watch(
	() => photoSwiper.open,
	(open, wasOpen) => {
		if (wasOpen && !open) endOverlay(450);
	},
);

function goDraw() {
	router.push(
		{ path: `/${FRONTEND_ROUTES.draw}`, query: { type: "competition" } },
		masterAnimation,
	);
}

const currentEntry = computed<CompetitionEntry | null>(() => {
	const own = store.myEntry;
	if (!own || !competition.value || !user.value) return null;
	const loaded = entries.value.find((entry) => entry._id === own._id);
	if (loaded) return loaded;

	return {
		_id: own._id,
		competition_id: own.competition_id ?? competition.value._id,
		author_id: own.author_id ?? user.value._id,
		author: {
			_id: user.value._id,
			name: user.value.name,
			img: user.value.img,
			customization: user.value.customization as any,
			stats: user.value.stats as any,
		},
		drawing_url: own.drawing_url ?? "",
		image_url: own.image_url ?? own.thumbnail_url,
		thumbnail_url: own.thumbnail_url,
		aspect_ratio: own.aspect_ratio ?? 1,
		caption: own.caption ?? "",
		caption_filtered: own.caption_filtered ?? "",
		is_winner: own.is_winner,
		won_category: own.won_category,
		vote_counts: own.vote_counts,
		total_votes: own.total_votes,
		my_votes: [],
		comment_count: own.comment_count ?? 0,
		submitted_at: own.submitted_at ?? new Date().toISOString(),
	};
});

function openCurrentEntry() {
	if (!currentEntry.value) return;
	void openOverlay(() => {
		myEntryOpen.value = true;
	});
}

async function openCompetitionFullscreen(entry: CompetitionEntry) {
	const collection = entries.value.some((item) => item._id === entry._id)
		? entries.value
		: [entry];
	const index = Math.max(
		0,
		collection.findIndex((item) => item._id === entry._id),
	);
	await captureOverlayScroll();
	myEntryOpen.value = false;
	photoSwiper.openSwiper(collection, index, {
		type: "competition",
		imageResolver: (item) => item.image_url,
		thumbnailResolver: (item) => item.thumbnail_url,
		canReply: (item) => !!item.drawing_url,
		onReply: remixCompetitionEntry,
		canVote: (item, currentUser) =>
			store.canVote && item.author_id !== currentUser?._id,
		onVote: openVoteFromFullscreen,
		canDelete: (item, currentUser) =>
			store.canSubmit && item.author_id === currentUser?._id,
		onDelete: async (item) => deleteCurrentEntry(item, false),
	});
	guardScroll(350);
}

function openVoteFromFullscreen(entry: CompetitionEntry) {
	photoSwiper.close();
	setTimeout(() => {
		selectedEntry.value =
			entries.value.find((item) => item._id === entry._id) ?? entry;
	}, 220);
}

async function remixCompetitionEntry(entry: CompetitionEntry) {
	if (!entry.drawing_url) {
		toast("This drawing cannot be remixed", { color: "warning" });
		return;
	}
	const alert = await alertController.create({
		header: "Remix this drawing?",
		message: "A copy will open on your canvas. The original stays unchanged.",
		cssClass: "liquid-alert",
		buttons: [
			{ text: "Cancel", role: "cancel" },
			{
				text: "Start remixing",
				handler: () => {
					myEntryOpen.value = false;
					photoSwiper.close();
					router.push({
						path: FRONTEND_ROUTES.draw,
						query: { canvas_url: entry.drawing_url, mode: "solo" },
					});
				},
			},
		],
	});
	await alert.present();
}

async function deleteCurrentEntry(entry: CompetitionEntry, confirm = true) {
	const remove = async () => {
		try {
			await withdrawEntry(entry.competition_id);
			store.removeOwnEntry(entry._id);
			myEntryOpen.value = false;
			toast("Competition entry deleted", { color: "success" });
		} catch {
			toast("This entry can no longer be deleted", { color: "danger" });
		}
	};
	if (!confirm) {
		await remove();
		return;
	}
	const alert = await alertController.create({
		header: "Delete your entry?",
		message:
			"Its votes and comments will also be removed. You can submit another entry while submissions are open.",
		cssClass: "liquid-alert",
		buttons: [
			{ text: "Keep it", role: "cancel" },
			{ text: "Delete entry", role: "destructive", handler: remove },
		],
	});
	await alert.present();
}
function openArchive(past: ArchivedCompetition) {
	void openOverlay(() => {
		archiveId.value = past._id;
	});
}

watch(
	() => store.requestedArchiveId,
	(id) => {
		if (!id) return;
		archiveId.value = id;
		store.requestedArchiveId = null;
	},
	{ immediate: true },
);

const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
function entryPageSize() {
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
			if (records[0]?.isIntersecting)
				void store.loadEntries(false, entryPageSize());
		},
		{ rootMargin: "400px 0px" },
	);
	observer.observe(sentinel.value);
}
watch(sentinel, attachObserver);

onIonViewDidEnter(async () => {
	startTicker();
	await authStore.waitUntilInitialized();
	if (!authStore.isLoggedIn) return;
	await store.refresh();
	trackEvent(mixpanelEvents.competitionPageOpen, {
		phase: store.phase,
		entered: store.hasEntered,
	});
	if (store.competition && entries.value.length === 0)
		await store.loadEntries(true, entryPageSize());
	attachObserver();
});
onIonViewDidLeave(() => {
	stopTicker();
	boundaryRefreshStarted = false;
	observer?.disconnect();
	store.flushImpressions();
});
onBeforeUnmount(() => {
	stopTicker();
	observer?.disconnect();
	store.flushImpressions();
});
</script>

<style scoped>
.--background-custom { --background: var(--ion-color-background) !important; }
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
ion-modal.competition-themes-sheet { --border-radius: 2rem 2rem 0 0; }
</style>
