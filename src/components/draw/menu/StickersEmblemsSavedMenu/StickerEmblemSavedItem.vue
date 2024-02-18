<template>
  <div
    ref="item"
    class="relative cursor-pointer hover:opacity-80 h-[100px]"
    :class="{ 'animate-wiggle': deleteMode }"
    @click="emits('click')"
  >

    <ion-skeleton-text :animated="true" class="w-4/5 absolute" v-if="isLoading"/>

    <ion-img
      :src="img"
      class="object-contain rounded-lg w-full h-full"
      :class="{ 'opacity-70': deleteMode, 'hover:brightness-90': deleteMode }"
      @contextmenu.prevent
      @ionImgDidLoad="isLoading = false"
    />
    <div class="absolute flex z-10 h-full w-full justify-center items-center top-0" v-if="deleteMode">
      <ion-icon :icon="svg(mdiClose)" class="fill-red-500 w-full h-[40px]" />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { onLongPress } from '@vueuse/core'
import { isMobile, svg } from '@/helper/general.helper'
import { mdiClose } from '@mdi/js'
import { IonIcon, IonImg } from '@ionic/vue'
import { ref } from 'vue'

const item = ref()
const isLoading = ref(true)

const props = defineProps<{
  deleteMode: boolean
  img: string
}>()

if (isMobile()) onLongPress(item, () => emits('long-press', true), { modifiers: { prevent: true }, delay: 100 })
// onClickOutside(item, () => (props.deleteMode ? emits('cancel-delete', false) : undefined))

const emits = defineEmits(['click', 'long-press', 'cancel-delete'])
</script>

<style scoped></style>
