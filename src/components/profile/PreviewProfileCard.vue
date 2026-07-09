<template>
  <!-- Scaled-down preview. Uses real ProfileCard so previews match production. -->
  <div class="preview-wrapper">
    <div class="preview-scale" :style="{ zoom, maxWidth: maxWidth + 'px' }">
      <ProfileCard
        :user="user"
        :customization="customization"
        :is-own-profile="false"
        :is-preview="true"
        :show-stats="showStats"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import ProfileCard from "@/components/profile/ProfileCard.vue";
import type { Customization } from "@/config/profile_options.config";

withDefaults(
	defineProps<{
		user: any;
		customization: Partial<Customization>;
		/** Zoom of the card (1 = full size). */
		zoom?: number;
		/** Max width of the card in px. */
		maxWidth?: number;
		/** Force the stats row on (defaults to hidden in preview). */
		showStats?: boolean;
	}>(),
	{ zoom: 0.7, maxWidth: 400 },
);
</script>

<style scoped>
.preview-wrapper {
  display: flex;
  justify-content: center;
}

.preview-scale {
  /* zoom (unlike transform: scale) collapses the layout box too, so the
     preview height tracks the real card — no reserved gap when there's no
     signature, and no clipping when there is one. */
  width: 100%;
  pointer-events: none;
}
</style>
