<template>
  <ion-modal
    :is-open="open"
    :initial-breakpoint="0.68"
    :breakpoints="[0, 0.5, 0.68, 0.86]"
    handle-behavior="cycle"
    class="competition-entry-sheet"
    @did-dismiss="$emit('close')"
  >
    <div v-if="entry" class="h-full overflow-y-auto bg-background cabin-sketch-regular pb-safe">
      <div class="sticky top-0 z-20 flex items-center justify-between gap-3 px-5 py-3 bg-background/95 backdrop-blur-lg border-b border-black/5">
        <div class="min-w-0">
          <p class="text-[10px] uppercase tracking-widest font-black text-black/80">
            {{ revealed ? 'Final votes' : (isOwnEntry ? 'Your current entry' : 'Vote for this drawing') }}
          </p>
          <h2 class="text-lg font-black text-black truncate">
            {{ entry.author?.name ?? 'Artist' }}
          </h2>
        </div>
        <ion-button fill="clear" color="dark" class="m-0" @click="$emit('close')">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" />
        </ion-button>
      </div>

      <div class="px-4 py-4">
        <div class="entry-showcase grid grid-cols-[minmax(0,1.1fr)_minmax(8.5rem,0.9fr)] items-center gap-0 mb-3 rounded-[1.75rem] border border-primary/35 bg-tertiary p-3 overflow-hidden">
          <img
            :src="entry.thumbnail_url || entry.image_url"
            :alt="`${entry.author?.name ?? 'Artist'} competition entry`"
            class="relative z-10 w-full h-40 rounded-2xl object-cover border-2 border-white/80 shadow-lg rotate-[-1.5deg]"
          />
          <button
            v-if="entry.author"
            type="button"
            class="relative z-0 min-w-0 -ml-3 cursor-pointer rounded-2xl transition-all md:hover:scale-[1.025]"
            aria-label="Open artist profile"
            @click="openProfile"
          >
            <PreviewProfileCard
              :user="entry.author"
              :customization="entry.author.customization ?? {}"
              :zoom="0.52"
              :max-width="360"
            />
          </button>
        </div>

        <div class="rounded-2xl border border-primary/35 bg-tertiary p-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-black text-black">
                {{ revealed ? `${entry.total_votes ?? 0} total votes` : 'Choose one category' }}
              </p>
              <p class="text-[11px] text-black/80 mt-0.5">
                {{ revealed ? 'Final category breakdown.' : 'Tap your selected category again to undo.' }}
              </p>
            </div>
            <span v-if="!revealed && entry.my_votes.length" class="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-black text-white">
              Selected
            </span>
          </div>

          <div class="grid gap-2 mt-3">
            <button
              v-for="category in categories"
              :key="category.id"
              type="button"
              class="w-full rounded-xl border px-3 py-2.5 flex items-center gap-3 text-left cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.015] md:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
              :class="hasVoted(category.id) ? 'bg-secondary text-white border-secondary' : 'bg-background text-black border-primary/35'"
              :disabled="!revealed && !votingAllowed(category.id)"
              @click="selectCategory(category.id)"
            >
              <span
                v-if="!revealed"
                class="w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0"
                :class="hasVoted(category.id) ? 'bg-white border-white text-secondary' : 'border-black/25 text-transparent'"
              >
                <ion-icon :icon="svg(mdiCheck)" class="text-sm" />
              </span>
              <ion-icon v-else :icon="svg(mdiVoteOutline)" class="text-lg text-secondary shrink-0" />
              <span class="flex-1 min-w-0">
                <span class="block text-sm font-black">{{ category.label }}</span>
                <span class="block text-[11px] opacity-80 mt-0.5">
                  <template v-if="revealed">{{ entry.vote_counts?.[category.id] ?? 0 }} total votes</template>
                  <template v-else-if="isOwnEntry">Your own entry cannot receive your vote</template>
                  <template v-else>{{ votesLeft[category.id] ?? 0 }} votes left in this category</template>
                </span>
              </span>
              <span v-if="hasVoted(category.id)" class="text-[10px] font-black">Your vote</span>
            </button>
          </div>
        </div>

        <p v-if="!canVote && !revealed" class="mt-3 text-center text-xs text-black/80">
          Voting is closed for this week.
        </p>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal } from "@ionic/vue";
import { mdiCheck, mdiClose, mdiVoteOutline } from "@mdi/js";
import PreviewProfileCard from "@/components/profile/PreviewProfileCard.vue";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import type { CompetitionCategory } from "@/config/competition.config";
import { svg } from "@/helper/general.helper";
import type { CompetitionEntry } from "@/service/api/competition.api";

const props = defineProps<{
	open: boolean;
	entry: CompetitionEntry | null;
	categories: CompetitionCategory[];
	accent?: string;
	votesLeft: Record<string, number>;
	canVote: boolean;
	revealed: boolean;
	isOwnEntry: boolean;
	profanityFilter?: boolean;
}>();

const emit = defineEmits<{
	(e: "close"): void;
	(e: "vote", entryId: string, categoryId: string): void;
}>();

const { openUserActions } = useUserContextSheet();

function openProfile() {
	if (!props.entry?.author) return;
	void openUserActions({
		_id: props.entry.author._id,
		name: props.entry.author.name,
		img: props.entry.author.img,
	});
}

const hasVoted = (categoryId: string) =>
	props.entry?.my_votes.includes(categoryId) ?? false;

const votingAllowed = (categoryId: string) =>
	props.canVote &&
	!props.isOwnEntry &&
	(hasVoted(categoryId) || (props.votesLeft[categoryId] ?? 0) > 0);

function selectCategory(categoryId: string) {
	if (props.revealed || !props.entry) return;
	emit("vote", props.entry._id, categoryId);
}
</script>

<style scoped>
.pb-safe { padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem); }
ion-modal.competition-entry-sheet { --border-radius: 2rem 2rem 0 0; }
</style>
