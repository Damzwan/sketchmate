<template>
  <img :src="item.thumbnail" :alt="`Drawing Thumbnail ${item._id}`" loading="eager"
       class="object-fill  absolute w-full" :class="{'z-20': isLoading}">
  <img :src="item.image" :alt="`Drawing ${item._id}`" @load="isLoading = false" loading="lazy" class="object-contain bg-white z-10">
</template>

<script setup lang="ts">
import { InboxItem } from '@/types/server.types'
import { ref } from 'vue'

const props = defineProps<{
  item: InboxItem
}>()

const isLoading = ref(true)

</script>

<style scoped>

</style>