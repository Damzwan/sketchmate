<template>
  <section class="mt-5 mb-16">
    <div v-if="loading" class="grid grid-cols-2 gap-3.5">
      <div v-for="n in 4" :key="n" class="aspect-square rounded-[2rem] bg-primary/10 animate-pulse" />
    </div>

    <div v-else-if="!entries.length" class="rounded-[2rem] border border-dashed border-primary/50 bg-tertiary px-5 py-10 text-center">
      <ion-icon :icon="svg(mdiTrophyOutline)" class="text-4xl text-secondary/55" />
      <p class="text-lg font-black text-black mt-3">No competition entries yet</p>
      <p class="text-sm text-black/60 mt-1">Your weekly entries and wins will live here.</p>
    </div>

    <div v-else class="grid grid-cols-2 gap-3.5">
      <button
        v-for="(entry, index) in displayEntries"
        :key="entry._id"
        type="button"
        class="relative aspect-square rounded-[2rem] overflow-hidden border border-primary/35 bg-tertiary shadow-sm text-left cursor-pointer active:scale-[0.98] transition-all md:hover:scale-[1.02] md:hover:shadow-md"
        @click="open(index)"
      >
<img width="1" height="1" :src="entry.thumbnail_url" :alt="entry.theme" class="w-full h-full object-cover" loading="lazy" decoding="async" />
        <span v-if="entry.is_winner" class="absolute top-2 left-2 h-7 px-2 rounded-full bg-black/70 text-white flex items-center gap-1 text-[10px] font-black">
          <ion-icon :icon="svg(mdiTrophyOutline)" />
          Winner
        </span>
        <span v-else-if="entry.pending" class="absolute top-2 left-2 h-7 px-2 rounded-full bg-black/70 text-white flex items-center text-[10px] font-black">
          In progress
        </span>
        <span
          v-if="entry.total_votes !== undefined"
          class="absolute top-2 right-2 h-7 px-2 rounded-full bg-black/80 text-white flex items-center gap-1 text-[10px] font-black"
        >
          <ion-icon :icon="svg(mdiVoteOutline)" />
          {{ entry.total_votes }}
        </span>
        <div class="absolute inset-x-0 bottom-0 p-3 pt-8 bg-gradient-to-t from-black/75 to-transparent">
          <p class="text-xs font-black text-white line-clamp-2 leading-snug">{{ entry.theme }}</p>
        </div>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiTrophyOutline, mdiVoteOutline } from "@mdi/js";
import { computed, onMounted, ref, watch } from "vue";
import { useConfirm } from "@/composables/useConfirm";
import { svg } from "@/helper/general.helper";
import router from "@/router";
import {
	fetchUserCompetitionEntries,
	type ProfileCompetitionEntry,
	withdrawEntry,
} from "@/service/api/competition.api";
import { useToast } from "@/service/toast.service";
import { useCompetitionStore } from "@/store/competition.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

const props = defineProps<{ user: any }>();
const entries = ref<ProfileCompetitionEntry[]>([]);
const loading = ref(true);
const swiper = usePhotoSwiper();
const competitionStore = useCompetitionStore();
const { toast } = useToast();
const { confirm } = useConfirm();

const displayEntries = computed(() =>
	entries.value.map((entry) => ({
		...entry,
		author: {
			_id: props.user._id,
			name: props.user.name,
			img: props.user.img,
			customization: props.user.customization,
		},
		description: entry.caption,
	})),
);

function open(index: number) {
	swiper.openSwiper(displayEntries.value, index, {
		type: "competition",
		imageResolver: (entry) => entry.image_url,
		thumbnailResolver: (entry) => entry.thumbnail_url,
		canReply: (entry) => !!entry.drawing_url,
		onReply: remixEntry,
		canDelete: (entry, currentUser) =>
			entry.can_delete && entry.author_id === currentUser._id,
		onDelete: async (entry) => {
			try {
				await withdrawEntry(entry.competition_id);
				entries.value = entries.value.filter(
					(candidate) => candidate._id !== entry._id,
				);
				if (competitionStore.competition?._id === entry.competition_id)
					competitionStore.removeOwnEntry(entry._id);
				toast("Competition entry deleted", { color: "success" });
			} catch {
				toast("This entry can no longer be deleted", { color: "danger" });
			}
		},
	});
}

async function remixEntry(entry: ProfileCompetitionEntry) {
	if (!entry.drawing_url) return;
	const shouldRemix = await confirm({
		header: "Remix this drawing?",
		message: "A copy will open on your canvas. The original stays unchanged.",
		confirmText: "Start remixing",
	});
	if (!shouldRemix) return;
	swiper.close();
	void router.push({
		path: FRONTEND_ROUTES.draw,
		query: { canvas_url: entry.drawing_url, mode: "solo" },
	});
}

async function load() {
	if (!props.user?._id) return;
	loading.value = true;
	try {
		const response = await fetchUserCompetitionEntries(props.user._id, 30);
		entries.value = response.entries;
	} catch (error) {
		console.warn("[competition] profile entries failed", error);
	} finally {
		loading.value = false;
	}
}

watch(() => props.user?._id, load);
onMounted(load);
</script>
