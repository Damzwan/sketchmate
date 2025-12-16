<template>
  <div class="relative w-full h-full">
    <img
      v-if="showThumbnail"
      :src="props.thumbnail"
      :alt="`Drawing ${props.thumbnail}`"
      class="object-contain absolute w-full h-full z-20 transition-opacity duration-150"
      :class="isLoading ? 'opacity-100' : 'opacity-0'"
    />

    <!-- Real image -->
    <img
      :src="props.image"
      @load="onImageLoad"
      class="object-contain absolute w-full h-full z-10 "
    />
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'

const isLoading = ref(true)
const showThumbnail = ref(true)

const props = defineProps({
  thumbnail: String,
  image: String,
  switchToImage: Boolean
})
const onImageLoad = () => {
  isLoading.value = false
  setTimeout(() => {
    showThumbnail.value = false
  }, 160) // slightly longer than duration-150
}


</script>

<style scoped>

</style>