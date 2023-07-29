<template>
  <ion-content>
    <NoItems v-if="user && user.emblems.length == 0" class="h-full" title="You have no emblems yet...">
      Press the add button <ion-icon class="pt-1" :icon="svg(mdiPlus)" /> to get started
    </NoItems>
    <div v-else class="saved-grid" ref="grid">
      <div v-for="emblem in user!.emblems" :key="emblem">
        <StickerEmblemSavedItem
          :img="emblem"
          :delete-mode="deleteMode"
          @click="emits('select-emblem', emblem)"
          @long-press="emits('update:delete-mode', true)"
          @cancel-delete="emits('update:delete-mode', false)"
        />
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
import { mdiMinus, mdiPlus } from '@mdi/js'
import { onClickOutside, onLongPress } from '@vueuse/core'
import { ref } from 'vue'
import NoItems from '@/components/draw/NoItems.vue'
import StickerEmblemSavedItem from '@/components/draw/menu/StickersEmblemsSavedMenu/StickerEmblemSavedItem.vue'

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

const { user } = storeToRefs(useAppStore())

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
