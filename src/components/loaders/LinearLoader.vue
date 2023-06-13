<template>
  <div class="flex justify-center h-full w-full items-center flex-col" :class="{ darken: darken }">
    <div class="w-3/5 w-max-[200px]">
      <ion-progress-bar color="primary" type="indeterminate" />
    </div>
    <p class="text-lg pt-3" v-if="text">{{ text }}</p>
    <p class="text-lg pt-3" v-else-if="dynamicText">{{ dynamicText[dynamicIndex].text }}</p>
  </div>
</template>

<script lang="ts" setup>
import { IonProgressBar } from '@ionic/vue'
import { ref } from 'vue'
import { DynamicTextPart } from '@/types/loader.types'

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
