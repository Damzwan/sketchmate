<template>
  <ion-item @click="onClick" :button="true">
    <div class="relative">
      <img :src="mate.img" :alt="mate._id" class="rounded-full w-[48px] my-2">
      <div
        v-show="clickedOnce"
        :class="{'animate-jump-in': toggle, 'animate-jump-out': !toggle}"
        class="bg-secondary rounded-full w-[20px] h-[20px] flex justify-center items-center absolute right-[-5px] bottom-[5px] animate-once animate-duration-200">
        <ion-icon :icon="svg(mdiCheckBold)" class="text-white" />
      </div>
    </div>
    <h2 class="font-medium text-lg pl-3">{{ mate.name }}</h2>
  </ion-item>
</template>

<script setup lang="ts">

import { svg } from '@/helper/general.helper'
import { mdiCheckBold } from '@mdi/js'
import { IonIcon, IonItem } from '@ionic/vue'
import { Mate } from '@/types/server.types'
import { ref } from 'vue'

const clickedOnce = ref(false)
const toggle = ref(false)

const emits = defineEmits(['click'])
const props = defineProps<{
  mate: Mate
}>()

function onClick() {
  clickedOnce.value = true
  toggle.value = !toggle.value
  emits('click')
}
</script>

<style scoped>

</style>