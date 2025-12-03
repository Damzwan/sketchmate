<template>
  <ion-content v-if="user">
    <NoStickerItems v-if="user.saved.length == 0" class="h-full" title="You have no saved drawings yet...">
      Select an object
      <ion-icon :icon="svg(mdiCursorDefaultClickOutline)" />
      and press the save button <br />
      under
      <ion-icon :icon="svg(mdiDotsVertical)" />
      in order to save it
    </NoStickerItems>

    <div class="saved-grid" v-else ref="grid">
      <div v-for="saved in user.saved" :key="saved.img" class="flex justify-center items-center">
        <StickerEmblemSavedItem
          :img="saved.img"
          :delete-mode="deleteMode"
          @click="emits('select-saved', saved)"
          @long-press="emits('update:delete-mode', true)"
          @cancel-delete="emits('update:delete-mode', false)"
        />
      </div>
    </div>
  </ion-content>
</template>

<script lang="ts" setup>
import { IonIcon, IonContent } from '@ionic/vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/store/auth.store'
import { svg } from '@/helper/general.helper'
import { mdiCursorDefaultClickOutline, mdiDotsVertical } from '@mdi/js'
import { Saved } from '@/types/server.types'
import { onClickOutside } from '@vueuse/core'
import { ref } from 'vue'
import NoStickerItems from '@/components/draw/menus/stickersEmblemsSavedMenu/NoStickerItems.vue'
import StickerEmblemSavedItem from '@/components/draw/menus/stickersEmblemsSavedMenu/StickerEmblemSavedItem.vue'

const { user } = storeToRefs(useAuthStore())

const grid = ref<HTMLElement>()

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
@reference "@/theme/main.css";

.saved-grid {
  @apply grid grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-4 p-4;
}
</style>