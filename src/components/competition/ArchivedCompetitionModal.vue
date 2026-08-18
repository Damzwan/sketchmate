<template>
  <ion-modal :is-open="!!competitionId" class="archive-competition-modal" @did-dismiss="$emit('close')">
    <div class="h-full overflow-y-auto bg-background cabin-sketch-regular">
      <header class="sticky top-0 z-30 px-4 pt-safe pb-3 bg-background/95 backdrop-blur-lg border-b border-black/5 flex items-center gap-3">
        <ion-button fill="clear" color="dark" class="m-0 -ml-2" @click="$emit('close')">
          <ion-icon :icon="svg(mdiArrowLeft)" slot="icon-only" />
        </ion-button>
        <div class="min-w-0 flex-1">
          <p class="text-[10px] uppercase tracking-widest font-black text-black/80">Past competition</p>
          <h2 class="text-lg font-black text-black truncate">{{ competition?.theme ?? 'Competition' }}</h2>
          <p v-if="competition" class="text-[11px] font-bold text-black/80 mt-0.5">{{ competitionDate }}</p>
        </div>
      </header>

      <div v-if="loading" class="py-20 flex justify-center">
        <ion-spinner name="dots" color="secondary" />
      </div>

      <template v-else-if="competition">
        <section v-if="results.length" class="px-4 pt-4">
          <h3 class="text-sm font-black uppercase tracking-widest text-black/80">Winners</h3>
          <div class="flex gap-2 mt-2 overflow-x-auto hide-scrollbar pb-1">
            <button
              v-for="row in results"
              :key="row.category_id"
              type="button"
              class="shrink-0 w-36 rounded-2xl overflow-hidden border border-primary/35 bg-tertiary text-left cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.025] md:hover:shadow-md"
              @click="openWinners"
            >
              <div class="relative">
<img width="1" height="1" loading="lazy" decoding="async" v-if="row.entry" :src="row.entry.thumbnail_url" :alt="row.category_label" class="w-full h-24 object-cover" />
                <div v-if="row.winner" class="absolute -bottom-4 left-2 rounded-full border-2 border-tertiary bg-tertiary shadow-sm">
                  <UserAvatar
                    :user="row.winner"
                    :customization="row.winner.customization"
                    size="xs"
                    static
                  />
                </div>
              </div>
              <div class="px-2 pb-2 pt-5">
                <p class="text-[10px] font-black text-black/80 uppercase line-clamp-1">{{ row.category_label }}</p>
                <p class="text-[11px] font-black text-black truncate mt-0.5">{{ row.winner?.name ?? 'Artist' }}</p>
              </div>
            </button>
          </div>
        </section>

        <CompetitionRewards :categories="competition.categories" />

        <section class="px-4 pt-6 pb-12">
          <div class="flex items-end justify-between gap-3 mb-3">
            <div>
              <h3 class="text-xl font-black text-black">All entries</h3>
              <p class="text-xs text-black/80 mt-0.5">Results are final, but conversations stay open.</p>
            </div>
            <span class="text-xs font-black text-black/80">{{ totalEntries }}</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 items-start">
            <EntryCard
              v-for="entry in entries"
              :key="entry._id"
              :entry="entry"
              :categories="competition.categories"
              :accent="competition.accent"
              :is-own-entry="entry.author_id === myId"
              :profanity-filter="profanityFilter"
              @vote="openEntry"
              @comment="selectedCommentEntry = $event"
              @report="report"
              @fullscreen="openFullscreen"
              @impression="() => {}"
            />
          </div>
          <div ref="sentinel" class="h-3" />
          <div v-if="loadingEntries" class="flex justify-center py-5">
            <ion-spinner name="dots" color="secondary" />
          </div>
        </section>
      </template>

      <CompetitionEntrySheet
        :open="!!selectedEntry"
        :entry="selectedEntry"
        :categories="competition?.categories ?? []"
        :accent="competition?.accent ?? 'sunset'"
        :votes-left="{}"
        :can-vote="false"
        revealed
        :is-own-entry="selectedEntry?.author_id === myId"
        :profanity-filter="profanityFilter"
        @close="selectedEntry = null"
        @vote="() => {}"
      />

    <CommentDrawer
        :open="!!selectedCommentEntry"
        :curr-item="selectedCommentEntry"
        type="competition"
        :user="user"
        @update:open="(open) => { if (!open) selectedCommentEntry = null }"
      />
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal, IonSpinner } from "@ionic/vue";
import { mdiArrowLeft } from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import CompetitionEntrySheet from "@/components/competition/CompetitionEntrySheet.vue";
import CompetitionRewards from "@/components/competition/CompetitionRewards.vue";
import EntryCard from "@/components/competition/EntryCard.vue";
import CommentDrawer from "@/components/general/CommentDrawer.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useConfirm } from "@/composables/useConfirm";
import { svg } from "@/helper/general.helper";
import router from "@/router";
import {
	type Competition,
	type CompetitionEntry,
	type CompetitionResultRow,
	fetchCompetition,
	fetchEntries,
	fetchResults,
} from "@/service/api/competition.api";
import { useAuthStore } from "@/store/auth.store";
import { useCompetitionStore } from "@/store/competition.store";
import { useMenuStore } from "@/store/menu.store";
import { useModerationStore } from "@/store/moderation.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

const props = defineProps<{ competitionId: string | null }>();
defineEmits<(e: "close") => void>();

const { user } = storeToRefs(useAuthStore());
const competition = ref<Competition | null>(null);
const entries = ref<CompetitionEntry[]>([]);
const totalEntries = ref(0);
const nextCursor = ref<number | null>(0);
const results = ref<CompetitionResultRow[]>([]);
const selectedEntry = ref<CompetitionEntry | null>(null);
const selectedCommentEntry = ref<CompetitionEntry | null>(null);
const loading = ref(false);
const loadingEntries = ref(false);
const myId = computed(() => user.value?._id);
const profanityFilter = computed(() => user.value?.profanity_filter ?? true);
const competitionDate = computed(() => {
	if (!competition.value) return "";
	const start = new Date(competition.value.starts_at);
	const end = new Date(competition.value.ends_at);
	const monthDay = new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	});
	return `${monthDay.format(start)} – ${monthDay.format(end)}, ${end.getFullYear()}`;
});
const photoSwiper = usePhotoSwiper();
const { confirm } = useConfirm();
const competitionStore = useCompetitionStore();
const menuStore = useMenuStore();

function openEntry(entry: CompetitionEntry) {
	selectedEntry.value =
		entries.value.find((candidate) => candidate._id === entry._id) ?? entry;
}

function openWinners() {
	if (!competition.value) return;
	competitionStore.targetResults(competition.value._id);
	menuStore.isCompetitionResultsOpen = true;
}

function openFullscreen(entry: CompetitionEntry) {
	const index = Math.max(
		0,
		entries.value.findIndex((candidate) => candidate._id === entry._id),
	);
	photoSwiper.openSwiper(entries.value, index, {
		type: "competition",
		imageResolver: (item) => item.image_url,
		thumbnailResolver: (item) => item.thumbnail_url,
		canReply: (item) => !!item.drawing_url,
		onReply: remixEntry,
	});
}

async function remixEntry(entry: CompetitionEntry) {
	if (!entry.drawing_url) return;
	const shouldRemix = await confirm({
		header: "Remix this drawing?",
		message: "A copy will open on your canvas. The original stays unchanged.",
		confirmText: "Start remixing",
	});
	if (!shouldRemix) return;
	photoSwiper.close();
	void router.push({
		path: FRONTEND_ROUTES.draw,
		query: { canvas_url: entry.drawing_url, mode: "solo" },
	});
}

function entryPageSize() {
	if (typeof window === "undefined") return 24;
	if (window.innerWidth >= 1536) return 36;
	if (window.innerWidth >= 1280) return 30;
	if (window.innerWidth >= 1024) return 24;
	if (window.innerWidth >= 640) return 18;
	return 12;
}

async function loadMoreEntries() {
	if (!props.competitionId || nextCursor.value === null || loadingEntries.value)
		return;
	loadingEntries.value = true;
	try {
		const page = await fetchEntries(
			props.competitionId,
			nextCursor.value,
			entryPageSize(),
		);
		const loaded = new Set(entries.value.map((entry) => entry._id));
		entries.value.push(
			...page.entries.filter((entry) => !loaded.has(entry._id)),
		);
		nextCursor.value = page.next_cursor;
		totalEntries.value = page.total;
	} finally {
		loadingEntries.value = false;
	}
}

const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;
function attachObserver() {
	observer?.disconnect();
	if (!sentinel.value) return;
	observer = new IntersectionObserver(
		(records) => {
			if (records[0]?.isIntersecting) void loadMoreEntries();
		},
		{ rootMargin: "500px 0px" },
	);
	observer.observe(sentinel.value);
}
watch(sentinel, attachObserver);
onBeforeUnmount(() => observer?.disconnect());

function report(entry: CompetitionEntry) {
	useModerationStore().openReport({
		type: "competition_entry",
		id: entry._id,
		label: `${entry.author?.name ?? "An artist"}'s entry`,
		blockUserId: entry.author_id,
	});
}

watch(
	() => props.competitionId,
	async (id) => {
		selectedEntry.value = null;
		selectedCommentEntry.value = null;
		competition.value = null;
		entries.value = [];
		totalEntries.value = 0;
		nextCursor.value = 0;
		results.value = [];
		if (!id) return;
		loading.value = true;
		try {
			const [detail, gallery, podium] = await Promise.all([
				fetchCompetition(id),
				fetchEntries(id, 0, entryPageSize()),
				fetchResults(id),
			]);
			competition.value = detail.competition;
			entries.value = gallery.entries;
			totalEntries.value = gallery.total;
			nextCursor.value = gallery.next_cursor;
			results.value = podium.results;
			await nextTick();
			attachObserver();
		} finally {
			loading.value = false;
		}
	},
);
</script>

<style scoped>
.pt-safe { padding-top: calc(env(safe-area-inset-top, 0px) + 0.5rem); }
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
ion-modal.archive-competition-modal { --width: 100%; --height: 100%; --border-radius: 0; }
</style>
