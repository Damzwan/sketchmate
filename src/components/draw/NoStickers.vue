<template>
  <div class="flex w-full h-full justify-center items-center flex-col">
    <ion-icon :icon="svg(mdiStickerEmoji)" class="w-[80px] h-[80px]" />
    <p class="text-lg text-center pt-2">You have no {{ type }} yet... </p>
  </div>
</template>

<script lang="ts" setup>
import { IonIcon } from '@ionic/vue'
import { mdiStickerEmoji } from '@mdi/js'
import { svg } from '@/helper/general.helper'

defineProps({
  type: String
})
</script>

<style scoped></style>
