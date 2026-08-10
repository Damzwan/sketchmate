<template>
  <div class="absolute inset-0 grain-bg" :style="{ opacity }"></div>
</template>

<script setup lang="ts">
defineProps<{ opacity: number }>();
</script>

<style scoped>
.grain-bg {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0.544 0.544 0.544 0 -0.3 0.544 0.544 0.544 0 -0.3 0.544 0.544 0.544 0 -0.3 0 0 0 0 1'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  background-size: 200px 200px;
  mix-blend-mode: overlay;
}
</style>
