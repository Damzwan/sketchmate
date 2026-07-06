<template>
  <!-- Scaled-down preview. Uses real ProfileCard so previews match production. -->
  <div class="preview-wrapper">
    <div class="preview-scale">
      <ProfileCard
        :user="user"
        :customization="customization"
        :is-own-profile="false"
        :is-preview="true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import ProfileCard from "@/components/profile/ProfileCard.vue";
import type { Customization } from "@/config/profile_options.config";

defineProps<{
	user: any;
	customization: Partial<Customization>;
}>();
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
  zoom: 0.7;
  width: 100%;
  max-width: 400px;
  pointer-events: none;
}
</style>