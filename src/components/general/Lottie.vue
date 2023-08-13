<template>
  <div ref="l" />
</template>

<script lang="ts" setup>
import { onMounted, ref, watch } from 'vue'
import lottie from 'lottie-web/build/player/lottie_light.min.js'

const l = ref()
let animationInstance: any = null

const props = defineProps({
  loop: {
    defaultValue: false,
    type: Boolean
  },
  autoplay: {
    defaultValue: true,
    type: Boolean
  },
  play: {
    defaultValue: false,
    type: Boolean
  },
  json: {
    required: true,
    type: Object
  }
})

onMounted(() => {
  animationInstance = lottie.loadAnimation({
    container: l.value,
    renderer: 'svg',
    loop: props.loop,
    autoplay: props.loop,
    animationData: props.json
  })
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
