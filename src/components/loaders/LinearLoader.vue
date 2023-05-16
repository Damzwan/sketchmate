<template>
  <div class="flex justify-center h-full w-full items-center bg-black bg-opacity-50 flex-col">
    <div class="w-3/5 w-max-[200px]">
      <ion-progress-bar color="primary" type="indeterminate" />
    </div>
    <p class="text-lg pt-3" v-if="text">{{ text }}</p>
  </div>
</template>

<script lang="ts" setup>
import { IonProgressBar } from '@ionic/vue'

defineProps({
  text: {
    type: String,
    required: false,
    default: 'loading'
  }
})
</script>

<style scoped></style>
