<template>
  <BaseSheetModal
    :is-open="isOpen"
    title="Reactions"
    :subtitle="`${totalReactionCount} total`"
    @close="$emit('close')"
  >
    <div class="flex flex-wrap justify-center items-end gap-x-8 gap-y-8 pt-6 pb-12 px-4">
      <div
        v-for="(key, index) in sortedReactions"
        :key="key"
        class="flex flex-col items-center justify-end gap-3 transition-transform hover:scale-110 cursor-pointer"
      >
        <img
          :src="reactionImages[key]"
          class="object-contain drop-shadow-xl"
          :style="{
            width: getReactionSize(index, post.reaction_counts[key]) + 'px',
            height: getReactionSize(index, post.reaction_counts[key]) + 'px'
          }"
          :alt="reactionLabels[key] || key"
        />

        <div class="flex flex-col items-center">
          <span class="text-3xl font-black text-black/80 leading-none tracking-tight">
            {{ post.reaction_counts[key] }}
          </span>
          <span class="text-xs font-black text-black/40 uppercase tracking-widest mt-1.5">
            {{ reactionLabels[key] || key }}
          </span>
        </div>
      </div>
    </div>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import BaseSheetModal from '@/components/general/BaseSheetModal.vue'
import { reactionImages, reactionLabels } from '@/config/post.config'
import { FeedPost } from '@/types/server.types'

const props = defineProps<{
  isOpen: boolean
  post: FeedPost
}>()

defineEmits(['close'])

const activeReactions = computed(() =>
  Object.keys(props.post.reaction_counts || {}).filter(
    (key) => props.post.reaction_counts[key] > 0
  )
)

const totalReactionCount = computed(() =>
  Object.values(props.post.reaction_counts || {}).reduce(
    (sum, count) => sum + count,
    0
  )
)

const sortedReactions = computed(() =>
  [...activeReactions.value].sort(
    (a, b) => props.post.reaction_counts[b] - props.post.reaction_counts[a]
  )
)

/**
 * Calculates a highly pronounced visual ranking size.
 * It uses a tiered base size depending on the rank (1st place, 2nd place, etc.),
 * and slightly modifies it by the true ratio to keep a natural feel.
 */
const getReactionSize = (index: number, count: number) => {
  if (activeReactions.value.length === 0) return 60

  const maxCount = Math.max(...Object.values(props.post.reaction_counts || {}))
  const ratio = maxCount > 0 ? count / maxCount : 0

  // Tiered base sizes for 1st, 2nd, 3rd, 4th, and 5th+
  const rankBaseSizes = [130, 100, 80, 60, 50]
  const baseSize = rankBaseSizes[index] || 40

  // Apply a slight modifier based on the ratio so the sizing feels organic
  return baseSize * (0.8 + (ratio * 0.2))
}
</script>