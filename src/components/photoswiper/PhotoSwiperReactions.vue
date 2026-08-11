<template>
  <!-- One pill, two jobs — the same split FeedPostCard uses: the emoji stack is
       "react", the count is "who reacted". They were fused into a single button,
       so there was no way to reach the breakdown from the viewer at all. -->
  <div class="relative flex items-center rounded-2xl bg-white/10 border border-white/5 shadow-inner overflow-hidden">
    <button
      @click.stop="(e) => $emit('open-popover', e)"
      class="flex cursor-pointer items-center pl-3 py-2 hover:bg-white/10 transition-all active:scale-90"
      :class="totalCount > 0 ? 'pr-2' : 'pr-3'"
      aria-label="React to this drawing"
    >
      <div class="flex -space-x-2.5">
        <!-- Colored heart if no reactions, otherwise top 3 active emojis -->
<img
             width="28"
             height="28"
             loading="lazy"
             decoding="async" v-if="activeReactions.length === 0" :src="reactionImages.love"
             class="w-7 h-7 object-contain drop-shadow-md" />
<img
             width="28"
             height="28"
             loading="lazy"
             decoding="async" v-else v-for="type in activeReactions" :key="type" :src="reactionImages[type]"
             class="w-7 h-7 object-contain drop-shadow-md" />
      </div>
    </button>

    <button
      v-if="totalCount > 0"
      @click.stop="$emit('open-breakdown')"
      class="flex cursor-pointer items-center gap-0.5 self-stretch pl-2 pr-2.5 border-l border-white/10
             hover:bg-white/10 transition-all active:scale-90"
      aria-label="See who reacted"
    >
      <span class="text-xs font-black text-white drop-shadow-sm cabin-sketch-regular">
        {{ formatNumber(totalCount) }}
      </span>
      <ion-icon :icon="svg(mdiChevronRight)" class="w-3 h-3 text-white/50" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiChevronRight } from "@mdi/js";
import { computed } from "vue";
import { svg } from "@/helper/general.helper";

const props = defineProps<{
	item: any;
	reactionImages: Record<string, string>;
}>();

defineEmits(["open-popover", "open-breakdown"]);

const totalCount = computed(() => {
	const counts = props.item.reaction_counts || {};
	return Object.values(counts).reduce((a: any, b: any) => a + b, 0) as number;
});

const activeReactions = computed(() => {
	const counts = props.item.reaction_counts || {};
	return Object.keys(counts)
		.filter((key) => counts[key] > 0)
		.slice(0, 3);
});

const formatNumber = (num: number) =>
	num >= 1000 ? (num / 1000).toFixed(1) + "k" : num;
</script>
