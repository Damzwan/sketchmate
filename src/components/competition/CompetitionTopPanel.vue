<template>
  <section class="px-4 pt-3 space-y-2">
    <button
      v-if="canSubmit && !hasEntered"
      type="button"
      class="w-full h-13 rounded-2xl px-3.5 flex items-center justify-between gap-3 text-left shadow-sm cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.015] md:hover:shadow-md"
      :style="ctaStyle"
      @click="$emit('draw')"
    >
      <span class="text-sm font-black leading-tight">
        Draw your one weekly entry
      </span>
      <ion-icon :icon="svg(mdiDraw)" class="text-xl shrink-0" />
    </button>

    <button
      v-if="myEntry"
      type="button"
      class="w-full h-14 rounded-2xl border border-primary/35 bg-tertiary p-2 flex items-center gap-3 text-left cursor-pointer shadow-sm transition-all active:scale-[0.98] md:hover:scale-[1.015] md:hover:shadow-md"
      @click="$emit('current-entry')"
    >
      <img :src="myEntry.thumbnail_url" alt="Your current competition entry" class="w-10 h-10 rounded-xl object-cover shrink-0" />
      <span class="min-w-0 flex-1">
        <span class="block text-[10px] font-black uppercase tracking-widest text-black/80">Your current entry</span>
        <span class="block text-xs font-black text-black mt-0.5 truncate">View your drawing</span>
      </span>
      <ion-icon :icon="svg(mdiChevronRight)" class="text-lg text-black/80 shrink-0" />
    </button>

    <div class="grid grid-cols-2 gap-2">
      <button
        type="button"
        class="h-18 rounded-2xl border border-primary/35 bg-tertiary p-3 text-left cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.025] md:hover:shadow-md"
        @click="$emit('themes')"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-black text-black">Choose next theme</span>
          <ion-icon :icon="svg(mdiChevronRight)" class="text-black/80 shrink-0" />
        </div>

      </button>

      <button
        type="button"
        class="h-18 rounded-2xl border border-primary/35 bg-tertiary p-3 text-left cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.025] md:hover:shadow-md"
        @click="openPast"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-black text-black">See previous competitions</span>
          <ion-icon :icon="svg(mdiChevronRight)" class="text-black/80 shrink-0" />
        </div>
      </button>
    </div>

    <div v-if="archiveOpen && archive.length" class="flex gap-2 overflow-x-auto hide-scrollbar -mx-4 px-4 pb-1">
      <button
        v-for="past in archive"
        :key="past._id"
        type="button"
        class="shrink-0 w-40 rounded-2xl border border-primary/35 bg-tertiary p-2 flex items-center gap-2 text-left cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.025] md:hover:shadow-md"
        @click="$emit('archive', past)"
      >
        <img
          v-if="past.winners[0]?.thumbnail_url"
          :src="past.winners[0].thumbnail_url"
          :alt="past.theme"
          class="w-10 h-10 rounded-xl object-cover shrink-0"
        />
        <div v-else class="w-10 h-10 rounded-xl bg-primary/10 shrink-0" />
        <span class="min-w-0">
          <span class="block text-[11px] font-black text-black truncate leading-tight">{{ past.theme }}</span>
          <span class="block text-[10px] font-bold text-black/80 mt-1">{{ formatCompetitionDate(past) }}</span>
        </span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiChevronRight, mdiDraw } from "@mdi/js";
import { computed, onMounted, ref } from "vue";
import { resolveAccent } from "@/config/competition.config";
import { svg } from "@/helper/general.helper";
import {
	type ArchivedCompetition,
	type CompetitionTheme,
	fetchArchive,
	type MyEntrySummary,
} from "@/service/api/competition.api";
import { useCompetitionStore } from "@/store/competition.store";

const props = defineProps<{
	accent: string;
	canSubmit: boolean;
	hasEntered: boolean;
	myEntry: MyEntrySummary | null;
}>();

defineEmits<{
	(e: "draw"): void;
	(e: "themes"): void;
	(e: "current-entry"): void;
	(e: "archive", competition: ArchivedCompetition): void;
}>();

const archive = ref<ArchivedCompetition[]>([]);
const themes = ref<CompetitionTheme[]>([]);
const archiveOpen = ref(false);
const leadingTheme = computed(() => themes.value[0] ?? null);
const colors = computed(() => resolveAccent(props.accent));
const ctaStyle = computed(() => ({
	background: `linear-gradient(135deg, ${colors.value.from}, ${colors.value.to})`,
	color: colors.value.ink,
}));

function formatCompetitionDate(competition: ArchivedCompetition) {
	const start = new Date(competition.starts_at);
	const end = new Date(competition.ends_at);
	const monthDay = new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	});
	return `${monthDay.format(start)} – ${monthDay.format(end)}, ${end.getFullYear()}`;
}

function openPast() {
	if (!archive.value.length) return;
	archiveOpen.value = !archiveOpen.value;
}

onMounted(async () => {
	// Themes go through the store: the sheet asks for the same payload the
	// moment it opens, and two identical requests per page visit is one too many.
	const [past, next] = await Promise.allSettled([
		fetchArchive(8),
		useCompetitionStore().loadThemes(),
	]);
	if (past.status === "fulfilled") {
		archive.value = [...past.value.competitions].sort(
			(a, b) =>
				new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
		);
	}
	if (next.status === "fulfilled" && next.value)
		themes.value = next.value.themes;
});
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
