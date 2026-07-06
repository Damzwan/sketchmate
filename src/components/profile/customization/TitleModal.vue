<template>
  <BaseSheetModal
    :is-open="isOpen"
    scrollable
    title="Artist Title"
    subtitle="Earned, never bought"
    @close="handleDismiss"
  >

    <div
      data-content-scroll="true"
      @touchmove.stop
      class="space-y-3 pb-4"
    >
      <div
        v-for="title in TITLES"
        :key="title.id"
        class="group relative flex items-center gap-4 p-4 rounded-[2rem] border transition-all duration-300 active:scale-[0.97]"
        :class="[
          localSelection === title.id
            ? 'bg-white border-secondary shadow-md'
            : 'bg-tertiary border-primary/40 shadow-sm hover:bg-white/60',
          !isUnlocked(title.id) && 'opacity-95'
        ]"
        @click="onTap(title)"
      >
        <div
          class="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 transition-all"
          :class="localSelection === title.id ? 'bg-secondary/10' : 'bg-white/80 shadow-inner'"
        >
          {{ title.emoji }}
        </div>

        <div class="flex-1 min-w-0">
          <span
            class="font-black text-lg leading-none block"
            :class="localSelection === title.id ? 'text-secondary' : 'text-black'"
          >
            {{ title.name }}
          </span>
          <p class="text-[11px] mt-1 leading-tight italic"
             :class="isUnlocked(title.id) ? 'text-black/60' : 'text-secondary/80'">
            {{ title.howTo }}
          </p>
        </div>

        <div
          v-if="isUnlocked(title.id)"
          class="w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
          :class="localSelection === title.id ? 'bg-secondary border-secondary shadow-lg' : 'border-black/5 bg-black/5'"
        >
          <ion-icon v-if="localSelection === title.id" :icon="svg(mdiCheck)" class="text-white text-lg" />
        </div>
        <div
          v-else
          class="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center shrink-0"
        >
          <ion-icon :icon="svg(mdiLockOutline)" class="text-black/40 text-base" />
        </div>
      </div>
    </div>

    <template #footer>
      <div class="px-1 pt-2 pb-1 bg-background">
        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          size="large"
          @click="confirmSelection"
        >
          Confirm Title
        </ion-button>
      </div>
    </template>
  </BaseSheetModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { IonButton, IonIcon } from '@ionic/vue'
import { mdiCheck, mdiLockOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { TITLES, type Title } from '@/config/profile_options.config'
import { buildItemId } from '@/config/catalog.config'
import { useInventoryStore } from '@/store/inventory.store'
import { useToast } from '@/service/toast.service'
import BaseSheetModal from '@/components/general/BaseSheetModal.vue'

const props = defineProps<{
  isOpen: boolean;
  currentTitleId: string;
}>()

const emit = defineEmits(['close', 'select'])

const inventoryStore = useInventoryStore()
const { toast } = useToast()

const localSelection = ref(props.currentTitleId)

// "None" (id: '') is always available; everything else needs the inventory item.
const isUnlocked = (id: string): boolean =>
  !id || inventoryStore.isOwned(buildItemId('title', id))

watch(
  () => props.isOpen,
  (open) => {
    if (open) localSelection.value = props.currentTitleId
  }
)

const onTap = (title: Title) => {
  if (!isUnlocked(title.id)) {
    toast(title.howTo, { color: 'secondary' })
    return
  }
  localSelection.value = localSelection.value === title.id ? '' : title.id
}

const confirmSelection = () => {
  if (!isUnlocked(localSelection.value)) return
  emit('select', localSelection.value)
  emit('close')
}

const handleDismiss = () => {
  emit('close')
}
</script>

<style scoped></style>
