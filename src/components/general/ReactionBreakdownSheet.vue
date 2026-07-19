<template>
  <BaseSheetModal
    :is-open="isOpen"
    title="Reactions"
    :subtitle="`${totalReactionCount} total`"
    @close="$emit('close')"
    @present="startReveal"
  >
    <div class="flex flex-wrap justify-center items-end gap-x-7 gap-y-9 pt-8 pb-12 px-4">
      <div
        v-for="(key, index) in sortedReactions"
        :key="key"
        class="reaction-col"
        :class="{ 'reaction-col--in': revealed }"
        :style="{ transitionDelay: `${index * 70}ms` }"
      >
        <!-- Winner marker. A quiet ribbon rather than a trophy: this sheet gets
             opened constantly, so the ranking should be readable at a glance and
             then get out of the way. -->
        <span v-if="index === 0 && sortedReactions.length > 1" class="top-badge">
          Top
        </span>

        <div class="relative flex items-end justify-center" :style="{ height: `${maxSize}px` }">
          <!-- Soft halo behind the leader only — marks it without adding motion
               that would compete with the emoji itself. -->
          <div v-if="index === 0 && sortedReactions.length > 1" class="winner-halo" />

          <img
            :src="reactionImages[key]"
            class="object-contain drop-shadow-xl relative"
            :class="{ 'winner-bob': index === 0 && sortedReactions.length > 1 }"
            :style="{
              width: getReactionSize(index, post.reaction_counts[key]) + 'px',
              height: getReactionSize(index, post.reaction_counts[key]) + 'px'
            }"
            :alt="reactionLabels[key] || key"
          />
        </div>

        <div class="flex flex-col items-center w-full mt-3">
          <!-- Ticks up from zero on open. The number moving is what makes the
               magnitude land; a static number is just a label. -->
          <span class="text-3xl font-black text-black/80 leading-none tracking-tight tabular-nums">
            {{ displayCounts[key] ?? 0 }}
          </span>
          <span class="text-xs font-black text-black/40 uppercase tracking-widest mt-1.5">
            {{ reactionLabels[key] || key }}
          </span>

          <!-- Share bar: the one element that states the ratio exactly. Emoji
               size is deliberately non-linear (tiered by rank), so on its own it
               exaggerates the gap — this keeps the sheet honest. -->
          <div class="share-track">
            <div
              class="share-fill"
              :style="{
                width: revealed ? `${sharePercent(key)}%` : '0%',
                transitionDelay: `${160 + index * 70}ms`
              }"
            />
          </div>
        </div>
      </div>
    </div>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import { reactionImages, reactionLabels } from "@/config/post.config";
import { FeedPost } from "@/types/server.types";

const props = defineProps<{
	isOpen: boolean;
	post: FeedPost;
}>();

defineEmits(["close"]);

const activeReactions = computed(() =>
	Object.keys(props.post.reaction_counts || {}).filter(
		(key) => props.post.reaction_counts[key] > 0,
	),
);

const totalReactionCount = computed(() =>
	Object.values(props.post.reaction_counts || {}).reduce(
		(sum, count) => sum + count,
		0,
	),
);

const sortedReactions = computed(() =>
	[...activeReactions.value].sort(
		(a, b) => props.post.reaction_counts[b] - props.post.reaction_counts[a],
	),
);

const sharePercent = (key: string) => {
	const total = totalReactionCount.value;
	if (!total) return 0;
	return Math.round((props.post.reaction_counts[key] / total) * 100);
};

/**
 * Calculates a highly pronounced visual ranking size.
 * It uses a tiered base size depending on the rank (1st place, 2nd place, etc.),
 * and slightly modifies it by the true ratio to keep a natural feel.
 */
const getReactionSize = (index: number, count: number) => {
	if (activeReactions.value.length === 0) return 60;

	const maxCount = Math.max(...Object.values(props.post.reaction_counts || {}));
	const ratio = maxCount > 0 ? count / maxCount : 0;

	// Tiered base sizes for 1st, 2nd, 3rd, 4th, and 5th+
	const rankBaseSizes = [130, 100, 80, 60, 50];
	const baseSize = rankBaseSizes[index] || 40;

	// Apply a slight modifier based on the ratio so the sizing feels organic
	return baseSize * (0.8 + ratio * 0.2);
};

// Reserve the tallest row height so the emojis sit on a shared baseline instead
// of each column centring itself at a different height.
const maxSize = computed(() =>
	sortedReactions.value.length
		? Math.max(
				...sortedReactions.value.map((k, i) =>
					getReactionSize(i, props.post.reaction_counts[k]),
				),
			)
		: 60,
);

// ─── Reveal animation ──────────────────────────────────────────────────────
// Everything is driven off one flag flipped when the sheet finishes presenting.
// Running it on `present` rather than on `isOpen` means the animation isn't
// racing the modal's own slide-up — starting during the transition is what makes
// this kind of thing feel janky.
const revealed = ref(false);
const displayCounts = ref<Record<string, number>>({});

const prefersReducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

let rafId: number | null = null;

function stopTicker() {
	if (rafId !== null) cancelAnimationFrame(rafId);
	rafId = null;
}

function setFinalCounts() {
	const final: Record<string, number> = {};
	for (const key of sortedReactions.value) {
		final[key] = props.post.reaction_counts[key];
	}
	displayCounts.value = final;
}

function startReveal() {
	revealed.value = true;

	if (prefersReducedMotion()) {
		setFinalCounts();
		return;
	}

	stopTicker();
	const DURATION = 620;
	const start = performance.now();
	// easeOutCubic: fast out of the gate, settles gently — no bounce on a number.
	const ease = (t: number) => 1 - (1 - t) ** 3;

	const step = (now: number) => {
		const t = Math.min(1, (now - start) / DURATION);
		const eased = ease(t);
		const next: Record<string, number> = {};
		for (const key of sortedReactions.value) {
			next[key] = Math.round(props.post.reaction_counts[key] * eased);
		}
		displayCounts.value = next;
		if (t < 1) rafId = requestAnimationFrame(step);
		else rafId = null;
	};
	rafId = requestAnimationFrame(step);
}

// Safety net. The columns start at opacity 0 and are only revealed by the
// modal's `did-present`. If that event ever fails to reach us, the sheet would
// render completely empty — a far worse failure than a missing animation. So
// arm a timer on open that forces the reveal if presentation hasn't done it.
let fallbackId: ReturnType<typeof setTimeout> | null = null;

function clearFallback() {
	if (fallbackId !== null) clearTimeout(fallbackId);
	fallbackId = null;
}

watch(
	() => props.isOpen,
	(open) => {
		clearFallback();

		if (open) {
			fallbackId = setTimeout(() => {
				if (!revealed.value) startReveal();
			}, 600);
			return;
		}

		// Reset so the next open replays rather than showing a finished state.
		stopTicker();
		revealed.value = false;
		displayCounts.value = {};
	},
);

onBeforeUnmount(() => {
	stopTicker();
	clearFallback();
});
</script>

<style scoped>
@reference "@/theme/main.css";

.reaction-col {
  @apply flex flex-col items-center justify-end cursor-pointer relative;
  width: 104px;
  opacity: 0;
  transform: translateY(14px) scale(0.9);
  transition:
    opacity 320ms ease-out,
    transform 420ms cubic-bezier(0.22, 1.4, 0.4, 1);
}

/* Slight overshoot on the way in — the playful bit. One-shot, on open only. */
.reaction-col--in {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.top-badge {
  @apply absolute -top-3 z-10 px-2 py-0.5 rounded-full bg-secondary text-white
  text-[9px] font-black uppercase tracking-widest shadow-md;
  transform: rotate(-6deg);
}

.winner-halo {
  @apply absolute inset-0 m-auto rounded-full pointer-events-none;
  width: 78%;
  height: 78%;
  background: radial-gradient(
    circle,
    var(--ion-color-secondary) 0%,
    transparent 70%
  );
  opacity: 0.16;
}

/* Very small, very slow. At 6px over 3.4s it reads as "alive" in peripheral
   vision without ever pulling the eye back once you've moved on. */
.winner-bob {
  animation: winner-bob 3.4s ease-in-out infinite;
}

@keyframes winner-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.share-track {
  @apply w-full h-1.5 rounded-full bg-black/10 overflow-hidden mt-3;
}

.share-fill {
  @apply h-full rounded-full bg-secondary;
  transition: width 720ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .reaction-col {
    opacity: 1;
    transform: none;
    transition: none;
  }

  .winner-bob {
    animation: none;
  }

  .share-fill {
    transition: none;
  }
}
</style>
