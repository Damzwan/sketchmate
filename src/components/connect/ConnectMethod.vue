<template>
  <ion-card color="transparent" class="custom-card" @click="action">
    <ion-img :src="img" alt="Big Image" />
    <p class="title">{{ title }}</p>
    <p class="subtitle">
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
  width: 86px;
  height: 86px;
}

.custom-card {
  @apply w-64 flex flex-col items-center p-1 m-0 shadow-sm
    bg-gradient-to-r from-primary-light to-primary
    border border-secondary-light
    rounded-lg cursor-pointer
    hover:shadow-lg;
}

.custom-card .title {
  @apply font-sans font-light text-lg py-1;
}

.custom-card .subtitle {
  @apply font-sans font-light text-sm text-center;
}

@media screen and (max-height: 800px) {
  ion-img {
    width: 64px;
    height: 64px;
  }
}

@media screen and (max-height: 700px) {
  .custom-card .title {
    @apply font-sans font-light text-base py-1;
  }

  .custom-card .subtitle {
    @apply font-sans font-light text-sm text-center;
  }

  ion-img {
    width: 54px;
    height: 54px;
  }

  .custom-card .title {
    @apply py-0.5;
  }

  .custom-card {
    @apply p-0.5;
  }
}
</style>
