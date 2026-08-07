<template>
  <div class="w-full min-h-full flex flex-col items-center text-center px-8 pt-[10vh] gap-5 cabin-sketch-regular">
    <img :src="img" alt="No messages" class="w-[78%] max-w-[340px] md:w-[38%] mx-auto" />

    <div class="flex flex-col items-center gap-1.5">
      <h1 class="text-3xl md:text-2xl font-bold text-black leading-tight">{{ title }}</h1>
      <p class="text-lg md:text-base text-black/60 leading-snug max-w-xs">{{ subtitle }}</p>
    </div>

    <ion-button color="secondary" :router-link="btnLink" shape="round" size="large" class="m-0">
      {{ btnText }}
    </ion-button>
  </div>
</template>

<script lang="ts" setup>
import { IonButton } from "@ionic/vue";

defineProps({
	img: String,
	title: String,
	subtitle: String,
	btnLink: String,
	btnText: String,
});
</script>

<style scoped></style>
