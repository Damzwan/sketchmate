<template>
  <ion-item
    @click="!isDisabled && emits('click')"
    :button="true"
    class="transition"
    :class="{
      'opacity-50 cursor-not-allowed pointer-events-none': isDisabled
    }"
    color="primary"
  >
    <div class="relative">
      <img
        :src="mate.img"
        :alt="mate._id"
        class="rounded-full w-12 my-2"
      />

      <div
        :class="{
          'animate-jump-in': isSelected,
          'animate-jump-out': !isSelected
        }"
        class="bg-secondary rounded-full w-5 h-5 flex justify-center items-center absolute right-[-5px] bottom-[5px] animate-once animate-duration-200"
      >
        <ion-icon :icon="svg(mdiCheckBold)" class="text-white" />
      </div>
    </div>

    <h2 class="font-medium text-lg pl-3">
      {{ mate.name }}
    </h2>
  </ion-item>
</template>


<script setup lang="ts">

import { svg } from '@/helper/general.helper'
import { mdiCheckBold } from '@mdi/js'
import { IonIcon, IonItem } from '@ionic/vue'
import { Mate } from '@/types/server.types'


const emits = defineEmits(['click'])
defineProps<{
  mate: Mate
  isSelected: boolean
  isDisabled: boolean
}>()


</script>

<style scoped>

</style>