<template>
  <ion-card color="transparent" class="custom-card" @click="action">
    <ion-img :src="img" alt="Big Image" />
    <p class="font-sans font-light text-2xl py-1">{{ title }}</p>
    <p class="font-sans font-light text-xm text-center">
      {{ subtitle }}
    </p>
  </ion-card>
</template>

<script lang="ts" setup>
import { IonCard, IonImg } from '@ionic/vue'

defineProps({
  img: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  subtitle: {
    type: String,
    required: true
  },
  action: {
    type: Function,
    required: true
  }
})
</script>

<style scoped>
ion-img {
  width: 96px;
  height: 96px;
}

.custom-card {
  @apply w-64 flex flex-col items-center p-2 shadow-sm
    bg-gradient-to-r from-primary-light to-primary
    border border-secondary-light
    rounded-lg cursor-pointer
    hover:shadow-lg;
}
</style>
