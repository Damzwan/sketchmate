<template>
  <div class="flex justify-center h-full w-full items-center flex-col" :class="{ darken: darken }">
    <div class="w-2/5 w-max-[200px] mb-[-40px]">
      <Lottie :json="loading_lottie" :loop="true" class="h-[200px]" />
    </div>
    <p class="text-lg" v-if="text">{{ text }}</p>
    <p class="text-lg" v-else-if="dynamicText">{{ dynamicText[dynamicIndex].text }}</p>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { DynamicTextPart } from '@/types/loader.types'
import loading_lottie from '@/assets/lottie/loading_lottie.json'
import Lottie from '@/components/general/Lottie.vue'

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
