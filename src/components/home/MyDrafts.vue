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
          class="min-w-[170px] max-w-[170px] rounded-3xl overflow-hidden snap-start flex-shrink-0 border transition-all group relative"
          :class="isPending(draft.id)
            ? 'bg-primary/20 border-primary/30 cursor-default pointer-events-auto'
            : 'bg-primary/40 border-primary/60 cursor-pointer active:scale-95'"
          @click="handleCardClick(draft.id)"
        >
          <!-- Preview Image Area -->
          <div class="h-28 w-full relative border-b border-primary/40 overflow-hidden bg-[#FAF0E6FF]">
            <img
              v-if="draft.thumbnail"
              :src="draft.thumbnail"
              class="w-full h-full object-contain p-2 transition-opacity duration-500"
              :class="{ 'opacity-50': isPending(draft.id) }"
              alt="Draft"
            />
            <div v-else class="absolute inset-0 flex items-center justify-center opacity-10">
              <span class="text-2xl">🖌️</span>
            </div>

            <!-- Pending overlay: subtle shimmer + spinner badge -->
            <div
              v-if="isPending(draft.id)"
              class="absolute inset-0 flex items-center justify-center bg-black/10 backdrop-blur-[1px]"
            >
              <div class="pending-shimmer absolute inset-0" />
              <div class="relative z-10 bg-white/90 rounded-full px-3 py-1.5 flex items-center gap-1.5 shadow-sm">
                <ion-spinner name="dots" class="w-4 h-4 text-black/70" />
                <span class="text-[10px] font-black text-black/70 uppercase tracking-wider">Saving</span>
              </div>
            </div>
          </div>

          <!-- Bottom Meta Section -->
          <div class="p-3 bg-white/30 backdrop-blur-md flex items-center justify-between">
            <div class="truncate pr-2">
              <p class="text-[9px] font-black text-black/40 uppercase tracking-tighter mb-0.5">
                {{ isPending(draft.id) ? 'Just now' : 'Last Edit' }}
              </p>
              <h3 class="text-xs font-bold text-black truncate">
                {{ isPending(draft.id) ? '...' : formatDate(draft.updatedAt) }}
              </h3>
            </div>

            <!-- Action menu — hidden while pending. Once the save lands, it
                 appears naturally as the card transitions to a real draft. -->
            <ion-button
              v-if="!isPending(draft.id)"
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
import { computed } from "vue";
import {
	actionSheetController,
	IonButton,
	IonIcon,
	IonSpinner,
} from "@ionic/vue";
import { DrawingDraft } from "@/draw/store/drawLoad.store";
import { mdiDeleteOutline, mdiDotsVertical, mdiShareOutline } from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { shareImg } from "@/helper/share.helper";

const props = defineProps<{
	drafts: DrawingDraft[];
	loading: boolean;
	pendingIds: Set<string>;
}>();

const emit = defineEmits<{
	(e: "open", id: string): void;
	(e: "delete", id: string): void;
}>();

const sortedDrafts = computed(() =>
	[...props.drafts].sort((a, b) => b.updatedAt - a.updatedAt),
);

const isPending = (id: string) => props.pendingIds.has(id);

// Tap on a pending card is a no-op (no toast, no jank). The visual treatment
// already tells the user it's not interactive yet.
const handleCardClick = (id: string) => {
	if (isPending(id)) return;
	emit("open", id);
};

const presentActionSheet = async (draft: DrawingDraft) => {
	if (isPending(draft.id)) return;

	const actionSheet = await actionSheetController.create({
		header: "Draft Options",
		cssClass: "custom-draw-action-sheet",
		buttons: [
			{
				text: "Share",
				icon: svg(mdiShareOutline),
				handler: async () => {
					if (draft.thumbnail) shareImg(draft.thumbnail);
				},
			},
			{
				text: "Delete",
				role: "destructive",
				icon: svg(mdiDeleteOutline),
				handler: () => emit("delete", draft.id),
			},
		],
	});
	await actionSheet.present();
};

const formatDate = (date: number) =>
	new Date(date).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

.snap-x {
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}

.fade-slow-enter-active, .fade-slow-leave-active { transition: opacity 0.4s ease; }
.fade-slow-enter-from, .fade-slow-leave-to { opacity: 0; }

/* Subtle shimmer on the pending overlay. Just enough motion that the card
   doesn't feel frozen, not so much it competes with the rest of the UI. */
.pending-shimmer {
  background: linear-gradient(
    100deg,
    transparent 30%,
    rgba(255, 255, 255, 0.35) 50%,
    transparent 70%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>

<style>
.custom-draw-action-sheet {
  --background: var(--ion-color-tertiary);
  --button-color: var(--ion-color-dark);
}
</style>