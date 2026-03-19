<template>
  <div
    class="safe-area-status-bar"
    :style="{ backgroundColor: color }"
  />
</template>

<script setup lang="ts">

const props = defineProps<{ color: string }>()
</script>

<style lang="scss" scoped>
/* Top bar overlay */
.safe-area-status-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: env(safe-area-inset-top); /* iOS & Android */
  z-index: 9999; /* above content */
}
</style>