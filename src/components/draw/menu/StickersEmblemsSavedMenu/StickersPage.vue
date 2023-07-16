<template>
  <ion-content>
    <NoStickers v-if="user && user.stickers.length == 0" type="stickers" class="h-full" />
    <div class="saved-grid" v-else-if="user" ref="grid">
      <div v-for="sticker in user.stickers" :key="sticker">
        <div
          class="relative cursor-pointer hover:opacity-80"
          :class="{ 'animate-wiggle': deleteMode }"
          @click="emits('select-sticker', sticker)"
        >
          <ion-img
            :src="sticker"
            class="rounded-lg"
            :class="{ 'opacity-70': deleteMode, 'hover:brightness-90': deleteMode }"
          />
          <div class="absolute flex z-10 h-full w-full justify-center items-center top-0" v-if="deleteMode">
            <ion-icon :icon="svg(mdiMinus)" class="fill-gray-300 w-full h-[40px]" />
          </div>
        </div>
      </div>
    </div>
  </ion-content>
</template>

<script lang="ts" setup>
import { IonIcon, IonContent, IonImg } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import NoStickers from '@/components/draw/NoStickers.vue'
import { svg } from '@/helper/general.helper'
import { mdiMinus } from '@mdi/js'
import { onMounted, Ref, ref } from 'vue'
import { onClickOutside, onLongPress } from '@vueuse/core'

const { user } = storeToRefs(useAppStore())
const grid = ref<HTMLElement>()

onLongPress(
  grid,
  () => {
    emits('update:delete-mode', true)
  },
  { modifiers: { prevent: true } }
)

defineProps<{
  deleteMode: boolean
}>()
onClickOutside(grid, () => emits('update:delete-mode', false))

const emits = defineEmits<{
  (e: 'update:delete-mode', deleteMode: boolean): void
  (e: 'select-sticker', selectedSticker: string): void
}>()
</script>

<style scoped>
.saved-grid {
  @apply grid grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4;
}
</style>
