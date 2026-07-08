<template>
  <div class="relative flex items-center">
    <button
      @click.stop="(e) => $emit('open-popover', e)"
      class="flex cursor-pointer items-center space-x-1.5 bg-white/10 hover:bg-white/20 px-3 py-2 rounded-2xl transition-all active:scale-90 border border-white/5 shadow-inner"
    >
      <!-- Icon Stack -->
      <div class="flex -space-x-2.5 mr-1">
        <!-- Colored heart if no reactions, otherwise top 3 active emojis -->
        <img v-if="activeReactions.length === 0" :src="reactionImages.heart"
             class="w-7 h-7 object-contain drop-shadow-md" />
        <img v-else v-for="type in activeReactions" :key="type" :src="reactionImages[type]"
             class="w-7 h-7 object-contain drop-shadow-md" />
      </div>

      <!-- Count -->
      <span v-if="totalCount > 0" class="text-xs font-black text-white drop-shadow-sm cabin-sketch-regular">
        {{ formatNumber(totalCount) }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
	item: any;
	reactionImages: Record<string, string>;
}>();

defineEmits(["open-popover"]);

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