<template>
  <div ref="lottieRef" />
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light.min.js'

const lottieRef = ref()
let animationInstance: any = null

const props = defineProps({
  loop: {
    type: Boolean,
    default: false
  },
  autoplay: {
    type: Boolean,
    default: true
  },
  play: {
    type: Boolean,
    default: false
  },
  speed: {
    type: Number,
    default: 1
  },
  json: {
    type: Object,
    required: true
  }
})


onMounted(() => {
  animationInstance = lottie.loadAnimation({
    container: lottieRef.value,
    renderer: 'svg',
    loop: props.loop,
    autoplay: props.loop,
    animationData: props.json
  })
  animationInstance.setSpeed(props.speed)
})

watch(
  () => props.play,
  newValue => {
    if (newValue && animationInstance) {
      animationInstance.play()
    } else if (!newValue && animationInstance) {
      animationInstance.stop()
    }
  }
)
</script>

<style scoped></style>
