<template>
  <ion-modal
    :is-open="open"
    :initial-breakpoint="sheetHeight"
    :breakpoints="[0, sheetHeight, 0.95]"
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
            {{ revealed ? `${entry.total_votes ?? 0} total votes` : 'Choose one category' }}
          </h2>
        </div>
        <ion-button fill="clear" color="dark" class="m-0" @click="$emit('close')">
          <ion-icon :icon="svg(mdiClose)" slot="icon-only" />
        </ion-button>
      </div>

      <div class="px-4 py-3">
        <!-- Compact identity strip. The full PreviewProfileCard used to live here
             and pushed every category below the fold, so the sheet only worked
             after the user dragged it up — in a sheet whose entire job is one
             tap. The artist's real card is still one tap away (and the winners
             moment renders it in full). -->
        <button
          type="button"
          class="w-full flex items-center gap-3 rounded-2xl border border-primary/35 bg-tertiary p-2.5 text-left cursor-pointer transition-all active:scale-[0.99] md:hover:scale-[1.01]"
          aria-label="Open artist profile"
          @click="openProfile"
        >
          <img
            width="1"
            height="1"
            loading="lazy"
            decoding="async"
            :src="entry.thumbnail_url || entry.image_url"
            :alt="`${entry.author?.name ?? 'Artist'} competition entry`"
            class="w-16 h-16 shrink-0 rounded-xl object-cover border-2 border-white/80 shadow-sm rotate-[-1.5deg]"
          />
          <span class="flex items-center gap-2 min-w-0 flex-1">
            <UserAvatar
              v-if="entry.author"
              :user="entry.author"
              :customization="entry.author.customization as any"
              size="xs"
              static
              class="shrink-0 aspect-square"
            />
            <span class="min-w-0">
              <span class="block text-sm font-black text-black truncate">
                {{ entry.author?.name ?? 'Artist' }}
              </span>
              <span v-if="caption" class="block text-[11px] text-black/80 truncate">{{ caption }}</span>
              <span v-else class="block text-[11px] text-black/60">View profile</span>
            </span>
          </span>
        </button>

        <div class="grid gap-2 mt-3">
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
            class="w-full rounded-xl border px-3 py-2.5 flex items-center gap-3 text-left cursor-pointer transition-all active:scale-[0.98] md:hover:scale-[1.015] md:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-45"
            :class="hasVoted(category.id) ? 'bg-secondary text-white border-secondary' : 'bg-tertiary text-black border-primary/35'"
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
              <span class="block text-sm font-black">{{ category.emoji }} {{ category.label }}</span>
              <span class="block text-[11px] opacity-80 mt-0.5">
                <template v-if="revealed">{{ entry.vote_counts?.[category.id] ?? 0 }} total votes</template>
                <template v-else-if="isOwnEntry">Your own entry cannot receive your vote</template>
                <template v-else>{{ votesLeft[category.id] ?? 0 }} votes left in this category</template>
              </span>
            </span>
            <span v-if="hasVoted(category.id)" class="text-[10px] font-black">Your vote</span>
          </button>
        </div>

        <p v-if="!revealed && !isOwnEntry" class="mt-2.5 text-center text-[11px] text-black/70">
          Tap your selected category again to undo.
        </p>
        <p v-if="!canVote && !revealed" class="mt-2 text-center text-xs text-black/80">
          Voting is closed for this week.
        </p>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal } from "@ionic/vue";
import { mdiCheck, mdiClose, mdiVoteOutline } from "@mdi/js";
import { computed } from "vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
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

/**
 * Size the sheet to its content instead of parking it at a fixed fraction.
 *
 * Every category has to be reachable without dragging: this sheet exists to
 * take one tap, and a vote option hidden below the fold is a vote that does not
 * happen. The base covers the header, the identity strip and the footer note;
 * the rest scales with however many categories the week actually has.
 */
const sheetHeight = computed(() =>
	Math.min(0.9, 0.4 + props.categories.length * 0.08),
);

const caption = computed(() =>
	props.profanityFilter && props.entry?.caption_filtered
		? props.entry.caption_filtered
		: (props.entry?.caption ?? ""),
);

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
