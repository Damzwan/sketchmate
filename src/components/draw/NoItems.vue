<template>
  <div class="flex w-full h-[85%] justify-center items-center flex-col">
    <ion-icon :icon="svg(mdiStickerEmoji)" class="w-[80px] h-[80px]" />
    <p class="text-lg text-center pt-2" v-html="title" />
    <p class="text-sm text-center">
      <slot />
    </p>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon } from '@ionic/vue'
import { mdiStickerEmoji } from '@mdi/js'
import { svg } from '@/helper/general.helper'

defineProps({
  title: String
})
</script>

<style scoped></style>
