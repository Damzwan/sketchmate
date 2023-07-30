<template>
  <div
    ref="item"
    class="relative cursor-pointer hover:opacity-80 h-[100px]"
    :class="{ 'animate-wiggle': deleteMode }"
    @click="emits('click')"
  >
    <ion-img
      :src="img"
      class="object-contain rounded-lg w-full h-full"
      :class="{ 'opacity-70': deleteMode, 'hover:brightness-90': deleteMode }"
    />
    <div class="absolute flex z-10 h-full w-full justify-center items-center top-0" v-if="deleteMode">
      <ion-icon :icon="svg(mdiMinus)" class="fill-red-500 w-full h-[40px]" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onClickOutside, onLongPress } from '@vueuse/core'
import { svg } from '@/helper/general.helper'
import { mdiMinus } from '@mdi/js'
import { IonIcon, IonImg } from '@ionic/vue'
import { ref } from 'vue'
const item = ref()

const props = defineProps<{
  deleteMode: boolean
  img: string
}>()

onLongPress(item, () => emits('long-press', true), { modifiers: { prevent: true }, delay: 100 })
onClickOutside(item, () => (props.deleteMode ? emits('cancel-delete', false) : undefined))

const emits = defineEmits(['click', 'long-press', 'cancel-delete'])
</script>

<style scoped></style>
