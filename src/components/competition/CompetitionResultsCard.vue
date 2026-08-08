<template>
  <button
    v-if="store.phase === 'announced'"
    type="button"
    class="mx-4 mt-4 rounded-2xl border border-primary/35 bg-tertiary p-3 flex items-center gap-3 text-left cursor-pointer shadow-sm transition-all active:scale-[0.98] md:hover:scale-[1.015] md:hover:shadow-md"
    style="width: calc(100% - 2rem)"
    @click="openResults"
  >
    <div class="flex -space-x-2 shrink-0">
      <div
        v-for="row in previewRows"
        :key="row.category_id"
        class="relative w-14 h-14 pb-2"
      >
        <div class="w-12 h-12 rounded-xl border-2 border-tertiary shadow-sm bg-tertiary overflow-hidden">
          <img
            v-if="row.entry"
            :src="row.entry.thumbnail_url"
            :alt="`${row.category_label} winner`"
            class="w-full h-full object-cover"
          />
        </div>
        <div
          v-if="row.winner"
          class="absolute bottom-0 left-1 rounded-full border-2 border-tertiary bg-tertiary shadow-sm"
        >
          <UserAvatar :user="row.winner" :customization="row.winner.customization" size="xs" static />
        </div>
      </div>
      <div v-if="isLoading" class="w-12 h-12 rounded-xl bg-primary/10 animate-pulse border-2 border-tertiary" />
    </div>
    <div class="min-w-0 flex-1">
      <p class="text-sm font-black text-black">Competition winners</p>
    </div>
    <ion-icon :icon="svg(mdiChevronRight)" class="text-xl text-black/80 shrink-0" />
  </button>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiChevronRight } from "@mdi/js";
import { computed, onMounted, ref } from "vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { svg } from "@/helper/general.helper";
import { useCompetitionStore } from "@/store/competition.store";
import { useMenuStore } from "@/store/menu.store";

const store = useCompetitionStore();
const menuStore = useMenuStore();
const isLoading = ref(false);
const previewRows = computed(() => (store.results ?? []).slice(0, 3));

async function ensureResults() {
	if (store.results || store.phase !== "announced") return;
	isLoading.value = true;
	try {
		await store.loadResults();
	} finally {
		isLoading.value = false;
	}
}

async function openResults() {
	await ensureResults();
	store.targetResults();
	menuStore.isCompetitionResultsOpen = true;
}

onMounted(ensureResults);
</script>
