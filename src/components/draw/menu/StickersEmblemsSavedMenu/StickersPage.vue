<template>
  <ion-content>
    <NoItems v-if="user && user.stickers.length == 0" class="h-full" title="You have no stickers yet...">
      Press the add button <ion-icon class="pt-1" :icon="svg(mdiPlus)" /> to get started
    </NoItems>
    <div class="saved-grid" v-else-if="user" ref="grid">
      <div v-for="sticker in user.stickers" :key="sticker">
        <StickerEmblemSavedItem
          :img="sticker"
          :delete-mode="deleteMode"
          @click="emits('select-sticker', sticker)"
          @long-press="emits('update:delete-mode', true)"
          @cancel-delete="emits('update:delete-mode', false)"
        />
      </div>
    </div>
  </ion-content>
</template>

<script lang="ts" setup>
import { IonContent, IonIcon } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useAppStore } from '@/store/app.store'
import NoItems from '@/components/draw/NoItems.vue'
import { svg } from '@/helper/general.helper'
import { mdiPlus } from '@mdi/js'
import { ref } from 'vue'
import StickerEmblemSavedItem from '@/components/draw/menu/StickersEmblemsSavedMenu/StickerEmblemSavedItem.vue'
import { onClickOutside } from '@vueuse/core'

const { user } = storeToRefs(useAppStore())
const grid = ref<HTMLElement>()

const props = defineProps<{
  deleteMode: boolean
}>()

onClickOutside(grid, () => (props.deleteMode ? emits('update:delete-mode', false) : undefined))

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
