<template>
  <ion-content v-if="user">
    <NoItems v-if="user.saved.length == 0" class="h-full" title="You have no saved drawings yet...">
      Select an object
      <ion-icon :icon="svg(mdiCursorDefaultClickOutline)" />
      and press the save button <br />
      under <ion-icon :icon="svg(mdiDotsVertical)" />
      in order to save it
    </NoItems>

    <div class="saved-grid" v-else ref="grid">
      <div v-for="saved in user.saved" :key="saved.img" class="flex justify-center items-center">
        <div
          class="relative cursor-pointer hover:opacity-80 h-[100px]"
          :class="{ 'animate-wiggle': deleteMode }"
          @click="emits('select-saved', saved)"
        >
          <ion-img
            :src="saved.img"
            class="object-contain rounded-lg w-full h-full"
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
import { IonIcon, IonImg, IonContent } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import NoStickers from '@/components/draw/NoItems.vue'
import { svg } from '@/helper/general.helper'
import { mdiCursorDefaultClickOutline, mdiDotsVertical, mdiMinus } from '@mdi/js'
import { Saved } from '@/types/server.types'
import { onClickOutside, onLongPress } from '@vueuse/core'
import { ref } from 'vue'
import NoItems from '@/components/draw/NoItems.vue'

const { user } = storeToRefs(useAppStore())

const grid = ref<HTMLElement>()

onLongPress(
  grid,
  () => {
    emits('update:delete-mode', true)
  },
  { modifiers: { prevent: true } }
)
const props = defineProps<{
  deleteMode: boolean
}>()

onClickOutside(grid, () => (props.deleteMode ? emits('update:delete-mode', false) : undefined))

const emits = defineEmits<{
  (e: 'update:delete-mode', deleteMode: boolean): void
  (e: 'select-saved', selectedSaved: Saved): void
}>()
</script>

<style scoped>
.saved-grid {
  @apply grid grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4;
}
</style>
