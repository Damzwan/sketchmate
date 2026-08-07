<template>
  <section class="mt-8 mb-16 overflow-visible">
    <!-- Cleaned Subhead Row Segment Structure -->
    <div class="flex items-center justify-between px-1 mb-3">
      <h3 class="uppercase tracking-widest font-black text-black/80">
        My Creative Posts
      </h3>
      <span v-if="posts.length" class="text-sm font-black text-black/70 uppercase tracking-widest">
        {{ posts.length }} Saved Sketches
      </span>
    </div>

    <!-- Loading Skeleton Cells Grid Layout -->
    <div v-if="loading && posts.length === 0" class="grid grid-cols-2 gap-3.5">
      <div
        v-for="i in 4"
        :key="i"
        class="aspect-square bg-tertiary rounded-[2rem] border border-primary/20 animate-pulse"
      ></div>
    </div>

    <!-- Empty Framework Fallback Drawing Callout Box -->
    <div
      v-else-if="posts.length === 0"
      class="text-center py-10 bg-tertiary rounded-[2.25rem] border border-dashed border-primary/60 shadow-sm px-4"
    >
      <ion-icon :icon="svg(mdiBrush)" class="text-4xl block mb-3 text-secondary/60 mx-auto" />
      <p class="cabin-sketch-regular text-lg font-bold text-black tracking-tight">
        You haven't shared any drawings yet.
      </p>
      <p class="text-[13px] text-black/60 mt-1">
        Publish your next sketch to the feed
      </p>
    </div>

    <!-- Polished Personal Artbook Display Mosaic Row -->
    <div v-else class="grid grid-cols-2 gap-3.5 overflow-visible">
      <div
        v-for="(post, index) in posts"
        :key="post._id"
        class="aspect-square bg-[#FAF8F5] rounded-[2rem] border border-primary/40 shadow-sm relative overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group cursor-pointer hover:scale-[1.02] hover:shadow-md hover:border-secondary/30 active:scale-[0.97]"
        @click="openPostSwiper(posts, index)"
      >
        <!-- High-contrast portfolio image snapshot cover -->
        <img
          :src="post.image_url"
          class="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          loading="lazy"
          alt="Portfolio entry"
        />

        <!-- Translucent Interface Navigation Badges Tray -->
        <div
          v-if="getTotalReactions(post.reaction_counts) > 0 || (post.views && post.views > 0)"
          class="absolute bottom-2.5 left-2.5 flex items-center space-x-2 bg-black/60 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/10 shadow-sm pointer-events-none"
        >
          <!-- Total Reactions Node Metric -->
          <div v-if="getTotalReactions(post.reaction_counts) > 0" class="flex items-center space-x-1">
            <ion-icon :icon="svg(mdiHeart)" class="text-[9px] text-white/90" />
            <span class="text-[10px] font-black text-white/90 tabular-nums tracking-tight">
              {{ formatNumber(getTotalReactions(post.reaction_counts)) }}
            </span>
          </div>

          <!-- Total Logging View Monitors Node Metric -->
          <div v-if="post.views && post.views > 0" class="flex items-center space-x-1">
            <ion-icon :icon="svg(mdiEye)" class="text-[9px] text-white/80" />
            <span class="text-[10px] font-black text-white/80 tabular-nums tracking-tight">
              {{ formatNumber(post.views) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiBrush, mdiEye, mdiHeart } from "@mdi/js";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import { svg } from "@/helper/general.helper";

defineProps<{
	posts: any[];
	loading: boolean;
}>();

const { openPostSwiper } = usePostSwiper();

const getTotalReactions = (counts?: Record<string, number>) =>
	Object.values(counts || {}).reduce((a, b) => a + b, 0);

const formatNumber = (n: number) =>
	n >= 1000 ? (n / 1000).toFixed(1) + "k" : n;
</script>

<style scoped>
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
</style>