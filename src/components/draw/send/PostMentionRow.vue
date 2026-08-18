<template>
  <!-- No permanent mates, no row. An empty picker in the composer reads as a
       feature that is broken rather than one that does not apply yet. The
       search term keeps it mounted, so the box cannot delete itself mid-type. -->
  <div v-if="canMention" class="bg-primary/10 rounded-xl p-3">
    <div class="flex items-center justify-between">
      <div class="flex-1 pr-3">
        <p class="text-sm font-black text-black leading-none">
          Shout someone out
          <span class="font-bold text-black/50">· up to {{ MAX_MENTIONS }}</span>
        </p>
        <p class="text-xs text-black/80 mt-1 leading-none">
          They'll be credited on the post and told about it.
        </p>
      </div>
      <button
        v-if="selected.size"
        type="button"
        class="text-xs cursor-pointer font-black uppercase tracking-wider text-secondary active:opacity-50"
        @click.stop="resetMentions()"
      >
        Clear ({{ selected.size }})
      </button>
    </div>

    <div class="relative mt-2">
      <ion-icon
        :icon="svg(mdiMagnify)"
        class="absolute left-3 top-1/2 -translate-y-1/2 text-black/40 text-base pointer-events-none"
      />
      <input
        v-model="mentionSearch"
        @input="onMentionSearch()"
        type="text"
        placeholder="Search mates..."
        class="w-full bg-white/60 border border-primary/30 rounded-xl py-2 pl-9 pr-8 text-sm font-bold text-black outline-none placeholder:font-normal placeholder:text-black/70"
      />
      <button
        v-if="mentionSearch"
        type="button"
        class="absolute right-2 cursor-pointer top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-black/10 text-black/70 active:scale-90"
        @click.stop="clearMentionSearch()"
      >
        <ion-icon :icon="svg(mdiClose)" class="text-xs" />
      </button>
    </div>

    <div
      ref="scrollEl"
      class="flex overflow-x-auto gap-2 pb-1 hide-scrollbar mt-2.5 min-h-[42px] items-center"
    >
      <div v-if="loading" class="w-full flex items-center justify-center py-2">
        <ion-spinner name="dots" color="secondary" />
      </div>
      <p
        v-else-if="!mentionCandidates.length"
        class="w-full text-center text-xs text-black/70 italic py-2 px-1"
      >
        No mates match your search.
      </p>
      <template v-else>
        <CreditChip
          v-for="mate in mentionCandidates"
          :key="mate._id"
          :user="mate"
          :selected="selected.has(mate._id)"
          @toggle="toggleMention(mate._id)"
        />
        <div ref="sentinel" class="shrink-0 w-1 h-1" />
        <div v-if="loadingMore" class="flex items-center px-2 shrink-0">
          <ion-spinner name="dots" color="secondary" />
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon, IonSpinner } from "@ionic/vue";
import { mdiClose, mdiMagnify } from "@mdi/js";
import { onMounted } from "vue";
import { svg } from "@/helper/general.helper";
import CreditChip from "./CreditChip.vue";
import type { useMentionPicker } from "./useMentionPicker";

const props = defineProps<{ picker: ReturnType<typeof useMentionPicker> }>();
const {
	MAX_MENTIONS,
	selected,
	mentionCandidates,
	canMention,
	mentionSearch,
	loading,
	loadingMore,
	scrollEl,
	sentinel,
	toggleMention,
	onMentionSearch,
	clearMentionSearch,
	resetMentions,
	ensureLoaded,
} = props.picker;

// The mate list is fetched here rather than when SendHub mounts: this row only
// exists once the artist has opened the post section, and most sends never do.
onMounted(ensureLoaded);
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
