<template>
  <!-- A short note from the developer, as a speech bubble with his avatar.
       The chrome (avatar, bubble, little tail) was copy-pasted in the shop and
       on the paywall before this existed; anywhere the app wants to talk to the
       user as a person rather than as an interface, it goes here. -->
  <div class="flex items-start gap-3">
<img
      width="44"
      height="44"
      loading="lazy"
      decoding="async"
      :src="bigbossImage"
      alt="Developer"
      class="w-11 h-11 rounded-full object-cover border-2 border-primary/50 shadow-sm shrink-0"
    />
    <div class="relative flex-1 min-w-0 rounded-2xl rounded-tl-sm border border-primary/40 bg-tertiary px-3.5 py-2.5">
      <!-- little speech tail -->
      <span class="absolute -left-1.5 top-3 w-3 h-3 rotate-45 bg-tertiary border-l border-b border-primary/40"></span>
      <p v-if="title" class="text-lg font-black text-black leading-none mb-1.5">{{ title }}</p>
      <div class="text-base leading-snug space-y-2">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import bigbossImage from "@/assets/bigboss.jpg";

defineProps<{
	/** Omit where the surrounding context already says who's talking. */
	title?: string;
}>();
</script>
