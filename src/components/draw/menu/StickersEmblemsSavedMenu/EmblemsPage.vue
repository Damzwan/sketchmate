<template>
  <ion-content>
    <NoStickers v-if="user!.emblems.length == 0" type="emblems" />
    <div v-else class="saved-grid" ref="grid">
      <div v-for="emblem in user!.emblems" :key="emblem">
        <div
          class="relative cursor-pointer hover:opacity-80"
          :class="{ 'animate-wiggle': deleteMode }"
          @click="emits('select-emblem', emblem)"
        >
          <ion-img :src="emblem" class="rounded-lg" :class="{ 'opacity-70': deleteMode }" />
          <div class="absolute flex z-10 h-full w-full justify-center items-center top-0" v-if="deleteMode">
            <ion-icon :icon="svg(mdiMinus)" class="fill-gray-300 w-full h-[40px]" />
          </div>
        </div>
      </div>
    </div>
  </ion-content>
</template>

<script lang="ts" setup>
import { IonIcon, IonImg, IonContent } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import NoStickers from '@/components/draw/NoStickers.vue'
import { svg } from '@/helper/general.helper'
import { mdiMinus } from '@mdi/js'
import { onClickOutside, onLongPress } from '@vueuse/core'
import { ref } from 'vue'

const grid = ref<HTMLElement>()

onLongPress(
  grid,
  () => {
    emits('update:delete-mode', true)
  },
  { modifiers: { prevent: true } }
)
onClickOutside(grid, () => emits('update:delete-mode', false))

const { user } = storeToRefs(useAppStore())

defineProps<{
  deleteMode: boolean
}>()

const emits = defineEmits<{
  (e: 'update:delete-mode', deleteMode: boolean): void
  (e: 'select-emblem', selectedEmblem: string): void
}>()
</script>

<style scoped>
.saved-grid {
  @apply grid grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4;
}
</style>
