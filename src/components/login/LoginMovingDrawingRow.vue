<template>
  <div :class="['relative overflow-hidden', isShortScreen ? 'h-36' : 'h-48']">
    <div
      class="absolute flex gap-4"
      :class="{
        'animate-scroll-left': direction === 'left',
        'animate-scroll-right': direction === 'right'
      }"
      :style="{ width: totalWidth + 'px' }"
    >
      <img
        v-for="(img, index) in drawings"
        :key="'row1-' + index"
        :src="img"
        :class="[isShortScreen ? 'h-36 w-[120px]' : 'h-48 w-[140px]', 'object-cover rounded-xl shrink-0 opacity-60']"
      />
      <img
        v-for="(img, index) in drawings"
        :key="'row1-dupe-' + index"
        :src="img"
        :class="[isShortScreen ? 'h-36 w-[120px]' : 'h-48 w-[140px]', 'object-cover rounded-xl shrink-0 opacity-60']"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{
  drawings: string[]
  direction?: 'left' | 'right'
}>()

const direction = props.direction ?? 'left' // default to 'left'

const imageWidth = 160
const gap = 16
const totalWidth = (props.drawings.length * (imageWidth + gap)) * 2

const screenHeight = ref(window.innerHeight)
const isShortScreen = ref(false)

onMounted(() => {
  screenHeight.value = window.innerHeight
  isShortScreen.value = screenHeight.value < 800
})

</script>

<style>
@keyframes scroll-left {
  0% {
    transform: translateX(0%);
  }
  100% {
    transform: translateX(-50%);
  }
}

@keyframes scroll-right {
  0% {
    transform: translateX(-50%);
  }
  100% {
    transform: translateX(0%);
  }
}

.animate-scroll-left {
  animation: scroll-left 150s linear infinite;
}

.animate-scroll-right {
  animation: scroll-right 150s linear infinite;
}
</style>
