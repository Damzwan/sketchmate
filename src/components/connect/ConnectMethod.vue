<template>
  <ion-card
    color="transparent"
    class="custom-card transition-opacity hover:opacity-70 active:opacity-70"
    @click="action"
  >
    <ion-img :src="img" alt="Big Image" />
    <p class="font-sans font-light text-xl py-1">{{ title }}</p>
    <p class="font-sans font-light text-xs text-center">
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
  width: 128px;
  height: 128px;
}

.custom-card {
  width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 5px;
  box-shadow: none;
  border: 1px solid rgba(0, 0, 0, 0.1);
  cursor: pointer;
}
</style>
