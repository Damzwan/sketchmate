<template>
  <div class="flex justify-center h-full w-full items-center flex-col" :class="{ darken: darken }">
    <div class="w-2/5 w-max-[200px] mb-[-40px]">
      <!--      <ion-progress-bar color="primary" type="indeterminate" />-->
      <LottieAnimation :animation-data="loading_lottie" :auto-play="true" :loop="true" :speed="1" ref="anim" />
    </div>
    <p class="text-lg" v-if="text">{{ text }}</p>
    <p class="text-lg" v-else-if="dynamicText">{{ dynamicText[dynamicIndex].text }}</p>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { DynamicTextPart } from '@/types/loader.types'
import { LottieAnimation } from 'lottie-web-vue'
import loading_lottie from '@/assets/lottie/loading_lottie.json'

const dynamicIndex = ref(0)

const props = defineProps<{
  text?: string
  dynamicText?: DynamicTextPart[]
  darken?: boolean
}>()

function setDynamicTextTimeOut() {
  setTimeout(() => {
    dynamicIndex.value += 1
    if (dynamicIndex.value < props.dynamicText!.length - 1) setDynamicTextTimeOut()
  }, props.dynamicText![dynamicIndex.value].duration)
}

if (props.dynamicText) {
  setDynamicTextTimeOut()
}
</script>

<style scoped>
.darken {
  @apply bg-black bg-opacity-50;
}
</style>
