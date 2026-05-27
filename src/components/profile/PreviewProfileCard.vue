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
  /* Reserve scaled-down height so layout doesn't jump */
  height: 280px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: hidden;
}

.preview-scale {
  transform: scale(0.6);
  transform-origin: top center;
  width: 100%;
  max-width: 400px;
  pointer-events: none;
}
</style>