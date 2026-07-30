<template>
  <section class="min-h-[160px] overflow-visible">
    <!-- Section Header Subhead -->
    <div class="flex items-center justify-between px-1 mb-2.5">
      <h2 class="uppercase tracking-widest font-black text-black/80">
        My Drafts
      </h2>
      <transition name="fade">
        <span v-if="!loading && drafts.length" class="text-sm font-black text-black/80 uppercase tracking-widest">
          {{ drafts.length }} Saved
        </span>
      </transition>
    </div>

    <transition name="fade-slow" mode="out-in">
      <!-- Compact Loading Skeleton Stack -->
      <div v-if="loading" key="loading" class="flex overflow-x-auto gap-3.5 pb-2 hide-scrollbar">
        <div
          v-for="i in 3"
          :key="i"
          class="min-w-[145px] max-w-[145px] h-32 bg-tertiary rounded-[2rem] border border-black/5 animate-pulse"
        ></div>
      </div>

      <!-- Playful, Minimal Empty State -->
      <div
        v-else-if="drafts.length === 0"
        key="empty"
        class="bg-tertiary rounded-[2rem] p-6 border border-dashed border-primary/60 flex flex-col items-center justify-center text-center shadow-sm"
      >
        <p class="cabin-sketch-regular text-xl font-black text-black/80">
          Your creative workspace is clean!
        </p>
        <p class="text-base text-black/80 mt-0.5">
          Start a new sketch above
        </p>
      </div>

      <!-- Live Draft Cards Row -->
      <div v-else key="data" class="flex overflow-x-auto gap-3.5 pb-3 snap-x snap-mandatory hide-scrollbar overflow-visible">
        <div
          v-for="draft in sortedDrafts"
          :key="draft.id"
          class="min-w-[145px] max-w-[145px] rounded-[2rem] overflow-hidden snap-start flex-shrink-0 border transition-all duration-300 group relative shadow-sm"
          :class="isPending(draft.id)
            ? 'bg-primary/20 border-primary/30 cursor-default'
            : 'bg-tertiary border-primary/40 cursor-pointer active:scale-95 hover:border-secondary/30'"
          @click="handleCardClick(draft.id)"
        >
          <!-- Drawing Board Preview Area Frame (Using full edge-to-edge object-cover layout) -->
          <div class="h-24 w-full relative border-b border-primary/10 overflow-hidden bg-[#FAF8F5] flex items-center justify-center">
            <img
              v-if="draft.thumbnail"
              :src="draft.thumbnail"
              class="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              :class="{ 'opacity-40': isPending(draft.id) }"
              alt="Draft snapshot"
            />
            <div v-else class="absolute inset-0 flex items-center justify-center opacity-20">
              <ion-icon :icon="svg(mdiPencilOutline)" class="text-xl group-hover:rotate-12 transition-transform duration-300" />
            </div>

            <!-- Pending / Saving Live Shimmer Layer -->
            <div
              v-if="isPending(draft.id)"
              class="absolute inset-0 flex items-center justify-center bg-white/40"
            >
              <div class="pending-shimmer absolute inset-0" />
              <div class="relative z-10 bg-white/95 rounded-full px-2.5 py-1 flex items-center gap-1 shadow-sm border border-black/5">
                <ion-spinner name="dots" class="w-3.5 h-3.5 text-secondary" />
                <span class="text-[8px] font-black text-black/80 uppercase tracking-widest">Saving</span>
              </div>
            </div>
          </div>

          <!-- Bottom Tray Metadata Area -->
          <div class="p-2.5 bg-white/50 flex items-center justify-between min-w-0 h-10">
            <div class="truncate pr-1 flex flex-col justify-center">
              <h3 class="text-xs font-black text-black truncate tracking-tight leading-none">
                {{ isPending(draft.id) ? 'Sketching...' : formatDate(draft.updatedAt) }}
              </h3>
              <!-- Cleaned text block for layout compactness -->
              <span class="text-[8px] text-black/60 uppercase tracking-wider mt-1 leading-none">
                {{ isPending(draft.id) ? 'Syncing...' : '' }}
              </span>
            </div>

            <!-- Context Options Drop Menu Trigger -->
            <ion-button
              v-if="!isPending(draft.id)"
              fill="clear"
              class="text-black/40 hover:text-black m-0 p-0 --compact-trigger-btn shrink-0"
              @click.stop="presentActionSheet(draft)"
            >
              <ion-icon
                slot="icon-only"
                class="text-base"
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
import { DrawingDraft } from "@/draw/document/document.store";
import {
	mdiDeleteOutline,
	mdiDotsVertical,
	mdiPencilOutline,
	mdiShareOutline,
} from "@mdi/js";
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

const handleCardClick = (id: string) => {
	if (isPending(id)) return;
	emit("open", id);
};

const presentActionSheet = async (draft: DrawingDraft) => {
	if (isPending(draft.id)) return;

	const actionSheet = await actionSheetController.create({
		header: "Draft Settings",
		cssClass: "liquid-action-sheet",
		buttons: [
			{
				text: "Share Sketch",
				icon: svg(mdiShareOutline),
				handler: async () => {
					if (draft.thumbnail) shareImg(draft.thumbnail);
				},
			},
			{
				text: "Discard Draft",
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
.hide-scrollbar::-webkit-scrollbar {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.snap-x {
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}

.--compact-trigger-btn {
  --padding-start: 2px;
  --padding-end: 2px;
  width: 24px;
  height: 24px;
}

.fade-slow-enter-active, .fade-slow-leave-active {
  transition: opacity 0.4s ease;
}
.fade-slow-enter-from, .fade-slow-leave-to {
  opacity: 0;
}

.pending-shimmer {
  background: linear-gradient(
    100deg,
    transparent 30%,
    rgba(255, 255, 255, 0.45) 50%,
    transparent 70%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
