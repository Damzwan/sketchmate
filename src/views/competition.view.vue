<template>
  <ion-page class="slide-page">
    <SubPageBar title="Competition" />

    <ion-content class="--background-custom">
      <div ref="rootEl" class="pb-16">
        <header v-if="competition" class="mx-4 mt-4 p-5 rounded-[2rem] border shadow-sm" :style="headerStyle">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="text-[11px] font-black uppercase tracking-widest">{{ phaseLabel }}</p>
              <h1 class="text-xl font-black leading-tight mt-1">{{ competition.theme }}</h1>
              <p v-if="competition.theme_blurb" class="text-sm mt-2 leading-snug">{{ competition.theme_blurb }}</p>
            </div>
            <div class="shrink-0 text-right">
              <p class="text-sm font-black">{{ countdown }}</p>
              <p class="text-[11px] mt-1">{{ competition.entry_count }} entries</p>
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
              <h2 class="cabin-sketch-regular text-xl font-black text-black">Entries</h2>
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

        <CommentDrawer
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
import { IonContent, IonPage, IonSpinner, useIonRouter } from "@ionic/vue";
import { storeToRefs } from "pinia";
import { computed, ref, watch } from "vue";
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
import CommentDrawer from "@/components/general/CommentDrawer.vue";
import SubPageBar from "@/components/general/SubPageBar.vue";
import { useCompetitionPageEntryActions } from "@/composables/competition/useCompetitionPageEntryActions";
import { useCompetitionPageLifecycle } from "@/composables/competition/useCompetitionPageLifecycle";
import { useOverlayScrollGuard } from "@/composables/general/useOverlayScrollGuard";
import { resolveAccent } from "@/config/competition.config";
import { masterAnimation } from "@/helper/animation.helper";
import {
	ArchivedCompetition,
	CompetitionEntry,
} from "@/service/api/competition.api";
import { useToast } from "@/service/toast.service";
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
const { toast } = useToast();
const selectedEntry = ref<CompetitionEntry | null>(null);
const selectedCommentEntry = ref<CompetitionEntry | null>(null);
const myVotesOpen = ref(false);
const themesOpen = ref(false);
const archiveId = ref<string | null>(null);
const myId = computed(() => user.value?._id);
const profanityFilter = computed(() => user.value?.profanity_filter ?? true);
const accentColors = computed(() => resolveAccent(competition.value?.accent));
const { countdown, sentinel } = useCompetitionPageLifecycle();

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
const {
	myEntryOpen,
	currentEntry,
	openCurrentEntry,
	openCompetitionFullscreen,
	remixCompetitionEntry,
	deleteCurrentEntry,
} = useCompetitionPageEntryActions({
	selectedEntry,
	openOverlay,
	captureOverlayScroll,
	guardScroll,
});

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
</script>

<style scoped>
.--background-custom { --background: var(--ion-color-background) !important; }
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
ion-modal.competition-themes-sheet { --border-radius: 2rem 2rem 0 0; }
</style>
