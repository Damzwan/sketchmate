<template>
  <img :src="props.thumbnail" :alt="`Drawing ${props.thumbnail}`" loading="eager"
       class="object-fill  absolute w-full z-50" v-if="isLoading">
  <img :src="props.image" :alt="`Drawing ${props.image}`" @load="() => isLoading = false" loading="lazy"
       v-if="props.switchToImage"
       class="object-contain bg-white z-10">
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