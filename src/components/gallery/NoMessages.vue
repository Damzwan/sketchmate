<template>
  <div class="w-full h-5/6 flex-col flex justify-center">
    <img :src="img" alt="No messages" class="w-full h-[16rem] md:h-[18rem]" />
    <div class="w-full flex flex-col justify-center items-center pt-3">
      <h1 class="text-2xl font-bold">{{title}}</h1>
      <p class="px-5 text-center text-lg">{{subtitle}}</p>
      <ion-button color="secondary" class="pt-2" :router-link="btnLink"
      >{{btnText}}
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
  btnText: String,
})
</script>

<style scoped></style>
