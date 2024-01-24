<template>
  <div class="w-full h-full flex items-center flex-col p-2">
    <ion-skeleton-text :animated="true" v-if="isLoading" class="w-[96px] h-[96px] rounded-full" />
    <img :src="mate.img" :alt="mate._id" width="96" class="rounded-full" v-show="!isLoading" @load="isLoading = false">
    <p class="text-xl pt-2 pb-1">{{ mate.name }}</p>
  </div>
</template>

<script setup lang="ts">

import { IonSkeletonText } from '@ionic/vue'
import { Mate } from '@/types/server.types'
import { ref } from 'vue'

defineProps<{
  mate: Mate
}>()

const isLoading = ref(true)

</script>

<style scoped>

</style>