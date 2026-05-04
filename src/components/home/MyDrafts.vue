<template>
  <section class="min-h-[180px]">
    <div class="flex items-center justify-between px-1 mb-3">
      <h2 class="text-base font-black text-black">My Drafts</h2>
      <transition name="fade">
        <span v-if="!loading && drafts.length" class="text-[10px] font-bold text-black/50 uppercase tracking-wider">
          {{ drafts.length }} Saved
        </span>
      </transition>
    </div>

    <transition name="fade-slow" mode="out-in">
      <!-- Loading Skeleton -->
      <div v-if="loading" key="loading" class="flex overflow-x-auto gap-4 pb-2 hide-scrollbar">
        <div v-for="i in 5" :key="i"
             class="min-w-[170px] max-w-[170px] bg-black/5 rounded-3xl overflow-hidden flex-shrink-0 border border-black/10 animate-pulse">
          <div class="h-28 bg-black/10 w-full"></div>
          <div class="p-3">
            <div class="h-3 w-16 bg-black/10 rounded-full"></div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="drafts.length === 0" key="empty"
           class="bg-primary/20 rounded-[2.5rem] p-8 border-2 border-dashed border-primary/60 flex flex-col items-center justify-center text-center">
        <span class="text-3xl mb-2 opacity-40">🖌️</span>
        <p class="text-xs font-black text-black/40 uppercase tracking-widest">No local drafts</p>
      </div>

      <!-- Draft Cards -->
      <div v-else key="data" class="flex overflow-x-auto gap-4 pb-2 snap-x snap-mandatory hide-scrollbar">
        <div
          v-for="draft in sortedDrafts"
          :key="draft.id"
          class="min-w-[170px] max-w-[170px] bg-primary/40 rounded-3xl overflow-hidden snap-start flex-shrink-0 border border-primary/60 transition-all cursor-pointer active:scale-95 group relative"
          @click="emit('open', draft.id)"
        >
          <!-- Preview Image Area -->
          <div class="h-28 w-full relative border-b border-primary/40 overflow-hidden bg-[#FAF0E6FF]">
            <img
              v-if="draft.thumbnail"
              :src="draft.thumbnail"
              class="w-full h-full object-contain p-2 transition-opacity duration-500"
              alt="Draft"
            />
            <div v-else class="absolute inset-0 flex items-center justify-center opacity-10">
              <span class="text-2xl">🖌️</span>
            </div>
          </div>

          <!-- Bottom Meta Section -->
          <div class="p-3 bg-white/30 backdrop-blur-md flex items-center justify-between">
            <div class="truncate pr-2">
              <p class="text-[9px] font-black text-black/40 uppercase tracking-tighter mb-0.5">Last Edit</p>
              <h3 class="text-xs font-bold text-black truncate">
                {{ formatDate(draft.updatedAt) }}
              </h3>
            </div>

            <!-- Action Trigger -->
            <ion-button
              fill="clear"
              color="secondary"
              class="text-black/50"
              @click.stop="presentActionSheet(draft)"
            >
              <ion-icon
                slot="icon-only"
                class="text-black"
                :icon="svg(mdiDotsVertical)"
              />
            </ion-button>
          </div>
        </div>
      </div>
    </transition>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { actionSheetController, IonButton, IonIcon } from '@ionic/vue'
import { DrawingDraft } from '@/draw/store/drawLoad.store'
import { Share } from '@capacitor/share'
import { mdiDeleteOutline, mdiDotsVertical, mdiShareOutline } from '@mdi/js'
import { svg } from '@/helper/general.helper'
import { shareImg } from '@/helper/share.helper' // Using MDI as requested

const props = defineProps<{
  drafts: DrawingDraft[]
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'delete', id: string): void
}>()

const sortedDrafts = computed(() => {
  return [...props.drafts].sort((a, b) => b.updatedAt - a.updatedAt)
})

const presentActionSheet = async (draft: DrawingDraft) => {
  const actionSheet = await actionSheetController.create({
    header: 'Draft Options',
    cssClass: 'custom-draw-action-sheet',
    buttons: [
      {
        text: 'Share',
        icon: svg(mdiShareOutline),
        handler: async () => {
          if (draft.thumbnail) {
            shareImg(draft.thumbnail)
          }
        }
      },
      {
        text: 'Delete',
        role: 'destructive',
        icon: svg(mdiDeleteOutline),
        handler: () => {
          emit('delete', draft.id)
        }
      }
    ]
  })
  await actionSheet.present()
}

const formatDate = (date: number) => {
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.snap-x {
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}

.fade-slow-enter-active, .fade-slow-leave-active {
  transition: opacity 0.4s ease;
}

.fade-slow-enter-from, .fade-slow-leave-to {
  opacity: 0;
}
</style>

<style>
/* Global styles for the action sheet colors */
.custom-draw-action-sheet {
  --background: var(--ion-color-tertiary);
  --button-color: var(--ion-color-dark);
}
</style>