<template>
  <div class="relative w-full h-full">
    <!-- Thumbnail always visible initially -->
    <img
      :src="props.thumbnail"
      :alt="`Drawing ${props.thumbnail}`"
      class="object-contain absolute w-full h-full z-10"
    />

    <!-- Real image -->
    <img
      :src="props.image"
      :alt="`Drawing ${props.image}`"
      @load="isLoading = false"
      class="object-contain absolute w-full h-full z-20 "
    />
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'

const isLoading = ref(true)

const props = defineProps({
  thumbnail: String,
  image: String,
  switchToImage: Boolean
})

</script>

<style scoped>

</style>