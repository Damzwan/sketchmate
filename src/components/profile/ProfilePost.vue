<template>
  <section class="mt-10">
    <div class="flex items-center justify-between px-2 mb-4">
      <h3 class="text-xl font-black text-black italic drop-shadow-sm">My Posts</h3>
      <span class="text-xs font-bold text-black/40">{{ posts.length }} Sketches</span>
    </div>

    <div v-if="loading && posts.length === 0" class="grid grid-cols-2 gap-3">
      <div
        v-for="i in 4"
        :key="i"
        class="aspect-square bg-primary/10 rounded-[2rem] animate-pulse border border-primary/20"
      ></div>
    </div>

    <div
      v-else-if="posts.length === 0"
      class="text-center py-10 bg-primary/5 rounded-[2.5rem] border-2 border-dashed border-primary/20"
    >
      <span class="text-4xl grayscale block mb-2 opacity-30">🎨</span>
      <p class="text-sm font-bold text-black/40">You haven't posted any sketches yet.</p>
    </div>

    <div v-else class="grid grid-cols-2 gap-3">
      <div
        v-for="(post, index) in posts"
        :key="post._id"
        class="aspect-square bg-primary/5 rounded-[2rem] border border-primary/20 shadow-sm relative overflow-hidden active:scale-95 transition-transform group cursor-pointer"
        @click="openPostSwiper(posts, index)"
      >
        <img
          :src="post.image_url"
          class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />

        <div
          v-if="getTotalReactions(post.reaction_counts) > 0 || (post.views && post.views > 0)"
          class="absolute bottom-2 left-2 flex items-center space-x-2 bg-black/40 backdrop-blur-md px-2 py-1 rounded-full border border-white/20 shadow-sm"
        >
          <!-- Reactions -->
          <div v-if="getTotalReactions(post.reaction_counts) > 0" class="flex items-center space-x-1">
            <ion-icon :icon="svg(mdiHeart)" class="text-[10px] text-white" />
            <span class="text-[10px] font-black text-white">
              {{ formatNumber(getTotalReactions(post.reaction_counts)) }}
            </span>
          </div>

          <!-- Views -->
          <div v-if="post.views && post.views > 0" class="flex items-center space-x-1">
            <ion-icon :icon="svg(mdiEye)" class="text-[10px] text-white" />
            <span class="text-[10px] font-black text-white">
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
import { mdiHeart, mdiEye } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { usePostSwiper } from "@/composables/home/usePostSwiper";

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
@reference "@/theme/main.css";
</style>