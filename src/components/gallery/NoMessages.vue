<template>
  <div class="w-full h-full flex-col flex justify-center">
    <img :src="img" alt="No messages" class="md:w-[30%] max-w-[600px] w-[70%] mx-auto" />
    <div class="w-full flex flex-col justify-center items-center pt-3">
      <h1 class="text-2xl font-bold">{{ title }}</h1>
      <p class="px-5 text-center text-lg">{{ subtitle }}</p>
      <ion-button color="secondary" :router-link="btnLink" shape="round" size="large"
      >{{ btnText }}
      </ion-button
      >
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IonButton } from '@ionic/vue'

defineProps({
  img: String,
  title: String,
  subtitle: String,
  btnLink: String,
  btnText: String
})
</script>

<style scoped></style>
