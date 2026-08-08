<template>
  <ion-modal
    :is-open="open"
    :initial-breakpoint="0.72"
    :breakpoints="[0, 0.48, 0.72, 0.92]"
    class="my-competition-votes-sheet"
    @did-dismiss="$emit('close')"
  >
    <div class="h-full overflow-y-auto bg-background cabin-sketch-regular pb-8">
      <header class="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 py-3 bg-background/95 backdrop-blur-lg border-b border-black/5">
        <div>
          <p class="text-[10px] font-black uppercase tracking-widest text-black/80">Your selections</p>
          <h2 class="text-xl font-black text-black">Drawings you voted for</h2>
        </div>
        <ion-button fill="clear" color="dark" class="m-0" @click="$emit('close')">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" />
        </ion-button>
      </header>

      <div v-if="store.isLoadingMyVotes" class="py-16 flex justify-center">
        <ion-spinner name="dots" color="secondary" />
      </div>
      <div v-else-if="!store.myVotedEntries.length" class="px-6 py-14 text-center">
        <p class="text-lg font-black text-black">No votes yet</p>
        <p class="text-sm text-black/80 mt-1">Use the Vote button on an entry to add it here.</p>
      </div>
      <div v-else class="px-4 py-4 space-y-2">
        <article
          v-for="entry in store.myVotedEntries"
          :key="entry._id"
          class="rounded-2xl border border-primary/35 bg-tertiary p-2.5 flex items-center gap-3 shadow-sm transition-all md:hover:shadow-md"
        >
          <img
            :src="entry.thumbnail_url || entry.image_url"
            :alt="`${entry.author?.name ?? 'Artist'} entry`"
            class="w-16 h-16 rounded-xl object-cover shrink-0"
          />
          <div class="min-w-0 flex-1">
            <button
              type="button"
              class="flex items-center gap-2 min-w-0 cursor-pointer transition-transform md:hover:scale-[1.02] origin-left"
              @click="openProfile(entry)"
            >
              <UserAvatar v-if="entry.author" :user="entry.author" :customization="entry.author.customization" size="xs" static />
              <span class="text-sm font-black text-black truncate">{{ entry.author?.name ?? 'Artist' }}</span>
            </button>
            <div class="flex flex-wrap gap-1 mt-2">
              <span
                v-for="categoryId in entry.my_votes"
                :key="categoryId"
                class="px-2 py-0.5 rounded-full bg-secondary text-white text-[10px] font-black"
              >
                {{ categoryLabel(categoryId) }}
              </span>
            </div>
          </div>
          <button
            type="button"
            class="shrink-0 px-3 py-2 rounded-xl border border-primary/35 bg-background text-xs font-black text-black cursor-pointer transition-all active:scale-95 md:hover:scale-[1.04]"
            @click="$emit('select', entry)"
          >
            {{ store.canVote ? 'Edit' : 'View' }}
          </button>
        </article>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal, IonSpinner } from "@ionic/vue";
import { mdiClose } from "@mdi/js";
import { watch } from "vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import type { CompetitionCategory } from "@/config/competition.config";
import { svg } from "@/helper/general.helper";
import type { CompetitionEntry } from "@/service/api/competition.api";
import { useCompetitionStore } from "@/store/competition.store";

const props = defineProps<{
	open: boolean;
	categories: CompetitionCategory[];
}>();
defineEmits<{
	(e: "close"): void;
	(e: "select", entry: CompetitionEntry): void;
}>();

const store = useCompetitionStore();
const { openUserActions } = useUserContextSheet();
const categoryLabel = (id: string) =>
	props.categories.find((category) => category.id === id)?.label ?? id;

function openProfile(entry: CompetitionEntry) {
	if (!entry.author) return;
	void openUserActions({
		_id: entry.author._id,
		name: entry.author.name,
		img: entry.author.img,
	});
}

watch(
	() => props.open,
	(open) => {
		if (open) void store.loadMyVotes();
	},
);
</script>

<style scoped>
ion-modal.my-competition-votes-sheet { --border-radius: 2rem 2rem 0 0; }
</style>
