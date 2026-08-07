<template>
  <ion-page id="page">
    <div
      class="top-0 left-0 right-0 z-[200] h-[56px] transition-all duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] bg-[var(--ion-color-background)]"
      :class="{ '-translate-y-full opacity-0 pointer-events-none': multiSelectMode }"
    >
      <TopBar title="Gallery" />
    </div>

    <transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="multiSelectMode"
        @click="cancelMultiSelect"
        class="fixed top-pad-safe left-0 right-0 z-[150] cursor-pointer flex items-center h-[56px] bg-[var(--ion-background-color)] border-b border-white/10 px-4"
      >
        <div class="flex items-center bg-secondary rounded-full -ml-2 transition-transform active:scale-95">
          <ion-button fill="clear" class="h-9 w-9 --padding-start-0 --padding-end-0">
            <ion-icon slot="icon-only" :icon="svg(mdiClose)" class="text-white text-xl" />
          </ion-button>
          <span class="font-bold text-base pr-4 text-white tabular-nums">
              {{ selectedItems.length }}
            </span>
        </div>
      </div>
    </transition>

    <ion-content>
      <!-- Multi-Select Contextual Header (Fully Restored Original Flow & UI) -->



      <!-- Grid Content Body Frame -->
      <div :class="{'pt-[56px]': isNative()}" class="h-full">
        <CircularLoader v-if="isLoading && inbox.length === 0" class="z-50" bgColor="bg-background" />

        <div v-else-if="user" class="w-full h-full">
          <ion-refresher
            slot="fixed"
            @ionRefresh="handleRefresh"
            class="z-[300]"
          >
            <ion-refresher-content refreshing-spinner="circular" />
          </ion-refresher>

          <NoMessages
            v-if="noMessages && !isInboxLoading"
            title="No drawings yet..."
            subtitle="Create a drawing see it over here"
            :img="noMessagesImg"
            btn-text="Start drawing"
            :btn-link="FRONTEND_ROUTES.draw"
          />

          <!-- Artistic Dynamic Portfolio Feed Grid -->
          <div class="h-full px-4 pt-4 gallery-feed-pad" v-else>
            <div v-for="date in sortDates(Object.keys(groupedInboxItems))" :key="date" class="pb-6">

              <!-- Month Stamp Divider Subhead -->
              <div class="px-1 mb-3">
                <h3 class="cabin-sketch-regular text-xl font-black text-black leading-none drop-shadow-sm">
                  {{ dayjs(date).format('MMMM, YYYY') }}
                </h3>
              </div>

              <!-- Organic Masonry-Style Flex Grid Grid -->
              <div class="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-8 gap-3.5 pt-1 overflow-visible">
                <div
                  v-for="(inboxItem, i) in groupedInboxItems[date]"
                  :key="inboxItem._id"
                  :ref="(element) => bindGalleryCell(element, inboxItem._id)"
                  class="gv-cell transition-all duration-300 overflow-visible"
                  :class="inboxItem.aspect_ratio > 1.2 ? 'col-span-2' : 'col-span-1'"
                >
                  <Thumbnail
                    v-if="isThumbnailActive(inboxItem._id)"
                    :inbox-item="inboxItem"
                    :user="user!"
                    :multi-selected-items="selectedItems"
                    :multi-select-mode="multiSelectMode"
                    @long-press="() => onItemLongPress(inboxItem)"
                    @click="onThumbnailClick(inboxItem)"
                    @hover="seeItem(inboxItem)"
                    :eager="i < 8"
                  />
                  <div v-else class="gv-placeholder bg-tertiary rounded-2xl border border-primary/40" />
                </div>
              </div>
            </div>

            <ion-infinite-scroll
              @ionInfinite="loadMore"
              :disabled="allLoaded"
              threshold="30%"
              position="bottom"
              class="gallery-infinite"
            >
              <ion-infinite-scroll-content class="gallery-infinite-content">
                <div class="flex justify-center py-4">
                  <div
                    class="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-tertiary border border-primary/40 shadow-md"
                  >
                    <ion-spinner name="dots" class="text-secondary w-6 h-6" />
                    <span class="text-sm font-black text-secondary">Loading more…</span>
                  </div>
                </div>
              </ion-infinite-scroll-content>
            </ion-infinite-scroll>
          </div>
        </div>
      </div>

      <!-- Global Actions Layout Overlays -->
      <GalleryActionSheet
        :selected-mode="multiSelectMode"
        :count="selectedItems.length"
        @cancel="cancelMultiSelect"
        @share="handleShare"
        @delete="alterTrigger.click()"
      />

      <div id="delete-multiple-images-alert" class="hidden" ref="alterTrigger" />
      <ConfirmationAlert
        header="Delete Drawings?"
        trigger="delete-multiple-images-alert"
        message="Selected sketches will be removed permanently for you."
        @confirm="deleteInboxItems"
      />
    </ion-content>
  </ion-page>
</template>

<script lang="ts" setup>
import {
	IonButton,
	IonContent,
	IonIcon,
	IonInfiniteScroll,
	IonInfiniteScrollContent,
	IonPage,
	IonRefresher,
	IonRefresherContent,
	IonSpinner,
	onIonViewWillEnter,
	onIonViewWillLeave,
	useBackButton,
} from "@ionic/vue";
import { mdiClose } from "@mdi/js";
import dayjs from "dayjs";
import { storeToRefs } from "pinia";
import {
	type ComponentPublicInstance,
	computed,
	nextTick,
	onBeforeUnmount,
	ref,
	watch,
} from "vue";
import noMessagesImg from "@/assets/illustrations/no_messages.webp";
import GalleryActionSheet from "@/components/gallery/GalleryActionSheet.vue";
import NoMessages from "@/components/gallery/NoMessages.vue";
import Thumbnail from "@/components/gallery/Thumbnail.vue";
import ConfirmationAlert from "@/components/general/ConfirmationAlert.vue";
import CircularLoader from "@/components/general/loaders/CircularLoader.vue";
import TopBar from "@/components/general/TopBar.vue";
import { useGalleryData } from "@/composables/gallery/useGalleryData";
import { useGallerySelection } from "@/composables/gallery/useGallerySelection";
import { useInboxSwiper } from "@/composables/gallery/useInboxSwiper";
import { sortDates, svg } from "@/helper/general.helper";
import { isNative } from "@/helper/platform.helper";
import { mixpanelEvents, trackEvent } from "@/service/mixpanel";
import { useAuthStore } from "@/store/auth.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

const { user } = storeToRefs(useAuthStore());

const { openInboxSwiper, seeItem } = useInboxSwiper();
const triggerSwiper = (item: any) => {
	const index = inbox.value.findIndex((val) => item._id === val._id);
	trackEvent(mixpanelEvents.inboxItemOpen, {
		inbox_id: item._id,
		seen: !!item.seen,
	});
	openInboxSwiper(inbox.value, index);
};

const {
	isLoading,
	inbox,
	isInboxLoading,
	allLoaded,
	groupedInboxItems,
	noMessages,
	fetchInitialInbox,
	loadMore,
	handleRefresh,
} = useGalleryData();

const {
	multiSelectMode,
	selectedItems,
	alterTrigger,
	onItemLongPress,
	onThumbnailClick,
	cancelMultiSelect,
	handleShare,
	deleteInboxItems,
} = useGallerySelection(user, inbox, triggerSwiper);

// Ionic keeps pages alive between tab switches. Only thumbnails within a wide
// viewport buffer are mounted, which bounds image decodes, ResizeObservers and
// component watchers regardless of how many metadata pages have been fetched.
const galleryActive = ref(false);
const visibleThumbnailIds = ref<Set<string>>(new Set());
const eagerThumbnailIds = computed(
	() => new Set(inbox.value.slice(0, 8).map((item) => item._id)),
);
const galleryCells = new Map<string, Element>();
let thumbnailObserver: IntersectionObserver | null = null;

function ensureThumbnailObserver() {
	if (thumbnailObserver || typeof IntersectionObserver === "undefined") return;
	thumbnailObserver = new IntersectionObserver(
		(entries) => {
			const next = new Set(visibleThumbnailIds.value);
			let changed = false;
			for (const entry of entries) {
				const id = (entry.target as HTMLElement).dataset.inboxId;
				if (!id) continue;
				if (entry.isIntersecting && !next.has(id)) {
					next.add(id);
					changed = true;
				} else if (!entry.isIntersecting && next.delete(id)) {
					changed = true;
				}
			}
			if (changed) visibleThumbnailIds.value = next;
		},
		{ rootMargin: "700px 0px" },
	);
}

function bindGalleryCell(
	element: Element | ComponentPublicInstance | null,
	id: string,
) {
	const previous = galleryCells.get(id);
	if (previous && previous !== element) thumbnailObserver?.unobserve(previous);
	if (!(element instanceof Element)) {
		galleryCells.delete(id);
		return;
	}
	(element as HTMLElement).dataset.inboxId = id;
	galleryCells.set(id, element);
	if (galleryActive.value) {
		ensureThumbnailObserver();
		thumbnailObserver?.observe(element);
	}
}

function isThumbnailActive(id: string): boolean {
	if (!galleryActive.value) return false;
	// Compatibility fallback for an unusually old WebView: retain functionality
	// even when the browser cannot provide observer-driven windowing.
	if (typeof IntersectionObserver === "undefined") return true;
	return visibleThumbnailIds.value.has(id) || eagerThumbnailIds.value.has(id);
}

function stopThumbnailObservation() {
	thumbnailObserver?.disconnect();
	visibleThumbnailIds.value = new Set();
}

onIonViewWillEnter(async () => {
	galleryActive.value = true;
	await fetchInitialInbox();
	await nextTick();
	ensureThumbnailObserver();
	for (const element of galleryCells.values())
		thumbnailObserver?.observe(element);
	nextTick(() => {
		checkAutoLoadMore();
	});
});

async function checkAutoLoadMore() {
	if (allLoaded.value) return;
	const isScreenNotFilled =
		document.documentElement.scrollHeight <= window.innerHeight;
	if (isScreenNotFilled) {
		await loadMore();
	}
}

let wasTrue = false;
watch(isLoading, () => {
	if (wasTrue) {
		checkAutoLoadMore();
	}
	wasTrue = isLoading.value;
});

useBackButton(9999, (processNextHandler) => {
	if (multiSelectMode.value) cancelMultiSelect();
	else processNextHandler();
});

onIonViewWillLeave(() => {
	cancelMultiSelect();
	galleryActive.value = false;
	stopThumbnailObservation();
});

onBeforeUnmount(() => {
	stopThumbnailObservation();
	thumbnailObserver = null;
	galleryCells.clear();
});
</script>

<style scoped>
ion-content{
  --background: var(--ion-color-background);
}

.--background-custom {
  --background: var(--ion-color-background) !important;
}
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
/* Windowing-lite: off-screen thumbnails skip layout/paint/style (and their
   img decode + ResizeObserver work) until scrolled near, so a large gallery no
   longer pays for every loaded item. `auto` intrinsic-size lets the browser
   remember each cell's real height after first render (no scroll jumping). */
.gv-cell {
  content-visibility: auto;
  contain-intrinsic-size: auto 120px;
}
.gv-placeholder {
  width: 100%;
  height: 110px;
  contain: strict;
}
ion-refresher {
  --color: var(--ion-color-secondary);
}
/* Keep the feed (and its infinite-scroll loader) clear of the floating tab dock
   — the dock is ~54px tall, lifted 12px + the bottom safe-area off the edge, so
   without this the loader pill renders underneath it. Extra room so the custom
   pill sits comfortably above the dock instead of hugging it. */
.gallery-feed-pad {
  padding-bottom: calc(7rem + var(--ion-safe-area-bottom, 0px));
}
/* Custom loader pill — the default infinite-scroll row was a faint tiny grey
   line that vanished behind the dock; give it real presence + margin. */
.gallery-infinite-content :deep(.infinite-loading) {
  margin: 0.25rem 0 1rem;
}
/* Style adjustments to make the custom ion buttons compact inside selection pill */
.--padding-start-0 {
  --padding-start: 0px !important;
}
.--padding-end-0 {
  --padding-end: 0px !important;
}
</style>
