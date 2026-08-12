<template>
  <section class="min-h-[160px] overflow-visible">
    <!-- Section Header Subhead -->
    <div class="flex items-center justify-between px-1 mb-2.5 gap-2">
      <h2 class="cabin-sketch-regular uppercase tracking-widest font-black text-black/80 shrink-0">
        My Drafts
      </h2>

      <transition name="fade">
        <!--
          ONE control, not two floating pills: status and the cloud recheck are
          segments of a single tertiary/primary capsule, the same shape language
          as the draft cards and the feed tabs. Two separate chips in two
          different greys is what made this read as bolted on.

          The status half opens the explainer; the refresh half only looks for
          newer remote revisions.
        -->
        <div
          v-if="syncVisible && !loading && (drafts.length || syncEnabled)"
          class="flex items-stretch rounded-full border border-primary/40 bg-tertiary shadow-sm overflow-hidden shrink-0"
        >
          <button
            type="button"
            class="relative flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 cursor-pointer transition-colors duration-200 hover:bg-secondary/10 active:scale-95 focus-visible:outline-2 focus-visible:outline-secondary"
            :title="syncEnabled ? 'How draft backup works' : 'Back up your drafts with Pro'"
            @click="emit('explain')"
          >
            <span v-if="!syncEnabled" class="sync-shimmer absolute inset-0 pointer-events-none" />
            <ion-spinner
              v-if="syncEnabled && syncStatus === 'syncing'"
              name="dots"
              class="w-3.5 h-3.5 text-secondary"
            />
            <ion-icon
              v-else
              class="text-sm relative"
              :class="syncEnabled ? 'text-secondary' : 'text-black/40'"
              :icon="svg(syncEnabled ? mdiCloudCheckOutline : mdiCloudOffOutline)"
            />
            <span class="text-[10px] font-black uppercase tracking-widest text-black/70 whitespace-nowrap relative">
              {{ syncLabel }}
            </span>
            <span
              v-if="!syncEnabled"
              class="relative text-[9px] font-black uppercase tracking-widest text-white bg-secondary rounded-full px-1.5 py-[1px]"
            >
              Pro
            </span>
          </button>

          <span v-if="syncEnabled" class="w-px bg-primary/40 my-1" />

          <button
            v-if="syncEnabled"
            type="button"
            class="px-2.5 flex items-center justify-center text-secondary cursor-pointer transition-colors duration-200 hover:bg-secondary/10 active:scale-95 disabled:opacity-35 disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-secondary"
            :disabled="checkingForUpdates || syncStatus === 'offline'"
            :title="checkingForUpdates ? 'Checking for newer drafts…' : 'Check for newer drafts'"
            :aria-label="checkingForUpdates ? 'Checking for newer drafts' : 'Check for newer drafts'"
            @click="emit('check-updates')"
          >
            <ion-icon
              :icon="svg(mdiRefresh)"
              class="text-base"
              :class="{ 'animate-spin': checkingForUpdates }"
            />
          </button>
        </div>
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
      <!-- Phone: one swipeable row. Desktop: wrap instead, because a mouse wheel
           cannot scroll a horizontal strip and a hidden scrollbar gives no hint
           that there is more to the right. -->
      <div v-else key="data" class="flex overflow-x-auto gap-3.5 pb-3 snap-x snap-mandatory hide-scrollbar overflow-visible md:flex-wrap md:overflow-x-visible">
        <div
          v-for="draft in sortedDrafts"
          :key="draft.id"
          class="min-w-[145px] max-w-[145px] rounded-[2rem] overflow-hidden snap-start flex-shrink-0 border transition-all duration-300 group relative shadow-sm"
          :class="isPending(draft.id)
            ? 'bg-primary/20 border-primary/30 cursor-default'
            : 'bg-tertiary border-primary/40 cursor-pointer active:scale-95 hover:border-secondary/40 hover:shadow-md'"
          @click="handleCardClick(draft.id)"
        >
          <!-- Drawing Board Preview Area Frame (Using full edge-to-edge object-cover layout) -->
          <div class="h-24 w-full relative border-b border-primary/10 overflow-hidden bg-[#FAF8F5] flex items-center justify-center">
<img
              width="1"
              height="1"
              loading="lazy"
              decoding="async"
              v-if="thumbnailUrls[draft.id]"
              :src="thumbnailUrls[draft.id]"
              class="w-full h-full object-contain transition-transform duration-500 ease-out group-hover:scale-105"
              :class="{ 'opacity-40': isPending(draft.id) }"
              alt="Draft snapshot"
            />
            <div v-else class="absolute inset-0 flex items-center justify-center opacity-20">
              <ion-icon :icon="svg(mdiPencilOutline)" class="text-xl group-hover:rotate-12 transition-transform duration-300" />
            </div>

            <!--
              Cloud state, corner-pinned so it never competes with the art.
              Tappable, and with a hit area larger than the glyph: a bare icon
              on a card is unreadable until something tells you what it means.
            -->
            <button
              v-if="syncEnabled && !isPending(draft.id) && cloudIcon(draft.id)"
              type="button"
              class="absolute top-0.5 right-0.5 z-20 p-1.5 cursor-pointer active:scale-90 transition-transform"
              aria-label="What does this icon mean?"
              @click.stop="emit('explain')"
            >
              <span class="block rounded-full bg-white/95 p-1 shadow-sm border border-black/5">
                <!--
                  A static cloud-arrow reads as "done" at 11px. Anything still
                  moving bytes gets a spinner so unfinished never looks finished.
                -->
                <ion-spinner
                  v-if="isBusy(draft.id)"
                  name="dots"
                  class="w-3 h-3 text-secondary block"
                />
                <ion-icon
                  v-else
                  class="text-[11px] block"
                  :class="syncState(draft.id) === 'synced' ? 'text-secondary' : 'text-black/45'"
                  :icon="svg(cloudIcon(draft.id)!)"
                />
              </span>
            </button>

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
              <!--
                Only rendered when there is something to say (see CARD_LABELS);
                a backed-up card says nothing, which is what makes the two that
                do speak worth reading.
              -->
              <span
                v-if="isPending(draft.id) || cardSyncLabel(draft.id)"
                class="text-[9px] uppercase tracking-wider mt-1 leading-none truncate block text-black/60"
              >
                {{ isPending(draft.id) ? 'Saving...' : cardSyncLabel(draft.id) }}
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
import {
	actionSheetController,
	IonButton,
	IonIcon,
	IonSpinner,
} from "@ionic/vue";
import {
	mdiCloudCheckOutline,
	mdiCloudDownloadOutline,
	mdiCloudOffOutline,
	mdiCloudSyncOutline,
	mdiCloudUploadOutline,
	mdiDeleteOutline,
	mdiDotsVertical,
	mdiPencilOutline,
	mdiRefresh,
	mdiShareOutline,
} from "@mdi/js";
import { computed, toRef } from "vue";
import { useDraftThumbnails } from "@/composables/home/useDraftThumbnails";
import type { DrawingDraftMetadata } from "@/draw/document/document.store";
import { svg } from "@/helper/general.helper";
import { shareImg } from "@/helper/share.helper";
import type { DraftSyncStatus } from "@/store/draftSync.store";

const props = withDefaults(
	defineProps<{
		drafts: DrawingDraftMetadata[];
		loading: boolean;
		pendingIds: Set<string>;
		syncEnabled?: boolean;
		/** Signed-in, non-guest session — the only one the pill means anything in. */
		syncVisible?: boolean;
		syncStatus?: DraftSyncStatus;
		syncStates?: Record<string, string>;
		checkingForUpdates?: boolean;
	}>(),
	{
		syncEnabled: false,
		syncVisible: false,
		syncStatus: "off",
		syncStates: () => ({}),
		checkingForUpdates: false,
	},
);

const emit = defineEmits<{
	(e: "open", id: string): void;
	(e: "delete", id: string): void;
	/** Open the backup explainer sheet (both tiers — it doubles as the upsell). */
	(e: "explain"): void;
	/** Force a cloud metadata check for revisions created on another device. */
	(e: "check-updates"): void;
	/** Retry cloud synchronization for one draft. */
	(e: "resync", id: string): void;
}>();

const sortedDrafts = computed(() =>
	[...props.drafts].sort((a, b) => b.updatedAt - a.updatedAt),
);

const { thumbnailUrls } = useDraftThumbnails(toRef(props, "drafts"));

const isPending = (id: string) => props.pendingIds.has(id);

const syncState = (id: string) => props.syncStates[id];

/**
 * Only states that are NOT the steady state get a badge and a caption.
 *
 * `synced` is deliberately absent from both. It is true of nearly every card,
 * nearly all of the time, and the header chip already says so once — repeating
 * "Backed up" on twelve cards is noise that buries the two cards that actually
 * want something from the user.
 */
const CLOUD_ICONS: Record<string, string> = {
	uploading: mdiCloudUploadOutline,
	cloud: mdiCloudDownloadOutline,
	downloading: mdiCloudDownloadOutline,
};

const CARD_LABELS: Record<string, string> = {
	uploading: "Backing up…",
	cloud: "Tap to download",
	downloading: "Downloading…",
};

/** States where bytes are still moving, so the badge must animate. */
const BUSY_STATES = new Set(["uploading", "downloading"]);

const cloudIcon = (id: string) => CLOUD_ICONS[syncState(id) ?? ""];

const isBusy = (id: string) => BUSY_STATES.has(syncState(id) ?? "");

const cardSyncLabel = (id: string) =>
	props.syncEnabled ? (CARD_LABELS[syncState(id) ?? ""] ?? "") : "";

const syncLabel = computed(() => {
	if (!props.syncEnabled) return "On this device";
	if (props.syncStatus === "syncing") return "Syncing";
	if (props.syncStatus === "offline") return "Offline";
	if (props.syncStatus === "error") return "Sync retrying";
	return "Backed up";
});

const handleCardClick = (id: string) => {
	// A cloud-only draft is downloading; a second tap would start nothing new
	// but would look like the first one failed.
	if (isPending(id) || syncState(id) === "downloading") return;
	emit("open", id);
};

const presentActionSheet = async (draft: DrawingDraftMetadata) => {
	if (isPending(draft.id)) return;

	const actionSheet = await actionSheetController.create({
		header: "Draft Settings",
		cssClass: "liquid-action-sheet",
		buttons: [
			{
				text: "Share Sketch",
				icon: svg(mdiShareOutline),
				handler: async () => {
					// The object url, not the Blob: shareImg fetches whatever it is
					// given, and an object url resolves without another copy.
					const url = thumbnailUrls.value[draft.id];
					if (url) shareImg(url);
				},
			},
			{
				text: props.syncEnabled ? "Backup & sync" : "Back up my drafts",
				icon: svg(props.syncEnabled ? mdiCloudSyncOutline : mdiCloudOffOutline),
				handler: () =>
					props.syncEnabled ? emit("resync", draft.id) : emit("explain"),
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

/* Slow, low-contrast sweep on the free-tier chip. Enough motion to read as
   "there is something here", far too slow to nag. */
.sync-shimmer {
  background: linear-gradient(
    100deg,
    transparent 35%,
    rgba(255, 255, 255, 0.75) 50%,
    transparent 65%
  );
  background-size: 250% 100%;
  animation: shimmer 4.5s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .sync-shimmer { animation: none; }
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
