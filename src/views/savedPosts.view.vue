<template>
  <ion-page class="slide-page">
    <SubPageBar title="Saved Posts" />

    <ion-content class="bg-background">
      <div class="w-full max-w-2xl mx-auto px-4 pt-4 pb-12 bot-pad-safe cabin-sketch-regular">

        <!-- A spinner, not a skeleton grid. A skeleton is a promise about SHAPE,
             and this list has no known length — four placeholder tiles resolving
             into one post (or none) reads as content that vanished. -->
        <div v-if="loading && savedPosts.length === 0" class="flex justify-center py-20">
          <ion-spinner name="dots" class="text-secondary scale-150" />
        </div>

        <div
          v-else-if="savedPosts.length === 0"
          class="text-center py-12 bg-tertiary rounded-[2.25rem] border border-dashed border-primary/60 shadow-sm px-4"
        >
          <ion-icon :icon="svg(mdiBookmarkOutline)" class="text-4xl block mb-3 text-secondary/60 mx-auto" />
          <p class="text-lg font-bold text-black tracking-tight">
            Nothing saved yet.
          </p>
          <p class="text-[13px] text-black/60 mt-1">
            Tap the bookmark on any post to keep it here.
          </p>
        </div>

        <!-- Same mosaic as the profile gallery on purpose: this is the same kind
             of list (a wall of drawings you tap into fullscreen), and giving it
             its own layout would make it read as a different feature. -->
        <div v-else class="grid grid-cols-2 gap-3.5 overflow-visible">
          <div
            v-for="(post, index) in savedPosts"
            :key="post._id"
            class="saved-tile aspect-square bg-[#FAF8F5] rounded-[2rem] border border-primary/40 shadow-sm relative overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group cursor-pointer hover:scale-[1.02] hover:shadow-md hover:border-secondary/30 active:scale-[0.97]"
            @click="openPostSwiper(savedPosts, index)"
          >
            <!-- The THUMBNAIL, never `image_url`. The full export is the raw
                 canvas blob; a tile is at most half a phone wide, so decoding
                 the full one here costs a multiple of the pixels for none of
                 the detail. -->
            <img
              width="1"
              height="1"
              decoding="async"
              loading="lazy"
              :src="post.thumbnail_url || post.image_url"
              class="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              alt="Saved post"
            />

            <!-- No `backdrop-blur` on either overlay, unlike the profile grid's
                 badge. A backdrop-filter forces the compositor to re-read the
                 backdrop for every one of these, twice per tile across a list
                 that pages to 200 — the single most expensive thing on this
                 page on a low-end Android. A solid scrim reads the same. -->
            <div class="absolute top-2 left-2 flex items-center gap-1 bg-black/65 px-2 py-0.5 rounded-full border border-white/10 pointer-events-none max-w-[85%]">
              <span class="text-[10px] font-black text-white/90 truncate">
                {{ post.author?.name }}
              </span>
            </div>

            <!-- Unsaving from the grid, without a round trip through fullscreen —
                 removing something is the main thing people come to this page
                 to do. `.stop` so it doesn't also open the viewer. -->
            <button
              @click.stop="() => unsave(post)"
              class="absolute bottom-2 right-2 h-8 w-8 rounded-full flex items-center justify-center bg-black/65 text-white border border-white/15 active:scale-90 transition-all cursor-pointer"
              aria-label="Remove from saved"
            >
              <ion-icon :icon="svg(mdiBookmarkRemoveOutline)" class="text-base" />
            </button>
          </div>
        </div>

        <ion-infinite-scroll
          v-if="savedPosts.length"
          @ionInfinite="loadMore"
          :disabled="!hasMoreSavedPosts"
          threshold="100px"
        >
          <ion-infinite-scroll-content loading-spinner="bubbles" />
        </ion-infinite-scroll>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
	IonContent,
	IonIcon,
	IonInfiniteScroll,
	IonInfiniteScrollContent,
	IonPage,
	IonSpinner,
	onIonViewDidEnter,
} from "@ionic/vue";
import { mdiBookmarkOutline, mdiBookmarkRemoveOutline } from "@mdi/js";
import { storeToRefs } from "pinia";
import { ref } from "vue";
import SubPageBar from "@/components/general/SubPageBar.vue";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import { useSavePost } from "@/composables/home/useSavePost";
import { useConfirm } from "@/composables/useConfirm";
import { svg } from "@/helper/general.helper";
import { useToast } from "@/service/toast.service";
import { usePostStore } from "@/store/post.store";
import type { FeedPost } from "@/types/server.types";

const postStore = usePostStore();
const { savedPosts, hasMoreSavedPosts, isSavedDirty } = storeToRefs(postStore);
const { openPostSwiper } = usePostSwiper();
const { toggleSave } = useSavePost();
const { confirm } = useConfirm();
const { toast } = useToast();

// Starts true, and only `onIonViewDidEnter` clears it. The page renders before
// that hook runs, so a `false` start would flash the "nothing saved yet" empty
// state for a frame on every open — the same flicker the skeleton grid caused,
// just at the other end.
const loading = ref(true);

async function load() {
	loading.value = true;
	try {
		await postStore.getSavedPosts(true);
	} catch {
		toast("Failed to load saved posts", { color: "danger" });
	} finally {
		loading.value = false;
	}
}

async function loadMore(event: any) {
	try {
		await postStore.getSavedPosts(false);
	} finally {
		event.target.complete();
	}
}

/**
 * Confirmed, unlike the bookmark toggle on a card or in the viewer. There the
 * control stays put and re-tapping puts it back; here the tile leaves the page,
 * and if you have scrolled a way in there is nothing left to undo it with.
 *
 * The store drops the row from `savedPosts` once the unsave lands, so there is
 * nothing to remove here.
 */
async function unsave(post: FeedPost) {
	const accepted = await confirm({
		header: "Remove from saved?",
		message: "You can save it again from the post any time.",
		confirmText: "Remove",
		destructive: true,
	});
	if (!accepted) return;
	await toggleSave(post);
}

onIonViewDidEnter(() => {
	// A save made elsewhere in the app marks the list dirty — the order here is
	// by save time, so a new entry belongs at the top and can't be appended.
	if (savedPosts.value.length === 0 || isSavedDirty.value) {
		void load();
		return;
	}
	// Cache hit: nothing to fetch, so nothing will clear the initial flag.
	loading.value = false;
});
</script>

<style scoped>
/* Browser-native virtualisation, same technique as FeedPostCard and EntryCard.
 * This list pages to 200 tiles, each holding a decoded bitmap — skipping the
 * layout, style and paint of the offscreen ones is most of what keeps the
 * scroll smooth on a low-end device.
 *
 * No `contain-intrinsic-size` here, deliberately, and unlike those two: the
 * tile carries `aspect-square`, so a skipped tile still resolves a definite
 * height from its own aspect-ratio and the grid's column width. Declaring an
 * intrinsic size as well would fight that and make the grid jump. */
.saved-tile {
  content-visibility: auto;
}
</style>
