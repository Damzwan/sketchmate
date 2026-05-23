<template>
  <ion-page class="slide-page">
    <SubPageBar title="My Network" />

    <ion-content class="bg-background">
      <div class="w-full max-w-3xl mx-auto px-6 pt-6 flex flex-col min-h-full">

        <!-- Tab Segment: Swapped to Secondary Theme -->
        <div class="mb-6 p-1 bg-primary/10 rounded-[1.5rem] border border-black/5 flex shrink-0 backdrop-blur-sm">
          <button
            v-for="tab in ['mates', 'following', 'followers']"
            :key="tab"
            @click="switchTab(tab as any)"
            class="flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-[1.2rem] transition-all"
            :class="activeTab === tab
              ? 'bg-secondary text-white shadow-md scale-[1.02]'
              : 'text-black/40 hover:text-black/60'"
          >
            {{ tab }}
          </button>
        </div>

        <!-- Search Bar -->
        <div class="relative mb-8 shrink-0">
          <ion-icon :icon="searchOutline" class="absolute left-4 top-1/2 -translate-y-1/2 text-black/20 text-lg" />
          <input
            v-model="searchQuery"
            @input="handleSearch"
            type="text"
            placeholder="Search artists (min. 3 chars)..."
            class="w-full bg-primary/5 border border-black/5 rounded-2xl py-3 pl-12 pr-4 text-sm font-bold focus:ring-2 focus:ring-secondary/20 transition-all outline-none"
          />
        </div>

        <section
          class="bg-primary/5 rounded-[2.5rem] p-6 border border-black/5 shadow-sm min-h-[400px] flex flex-col mb-10">

          <div class="flex items-center justify-between px-2 mb-6">
            <h3 class="cabin-sketch-regular text-2xl font-normal text-black capitalize">
              {{ activeTab }}
            </h3>
            <!-- Optional: Show count if available -->
            <span v-if="currentList.length" class="text-[10px] font-black text-black/20 uppercase tracking-widest">
              {{ currentList.length }} found
            </span>
          </div>

          <!-- Initial Loading -->
          <div v-if="networkLoading && currentPage === 1" class="flex-1 flex justify-center py-20 opacity-20">
            <ion-spinner name="crescent" color="secondary" />
          </div>

          <!-- The List -->
          <div v-else-if="currentList.length > 0" class="space-y-3">
            <div
              v-for="person in currentList"
              :key="person._id"
              @click="openUserActions(person)"
              class="flex items-center p-3 bg-white/40 rounded-3xl border border-white/60 active:scale-95 transition-all cursor-pointer group shadow-sm"
              :class="{ 'border-secondary/30 bg-secondary/5': person.chat_status === 'temporary' || person.chat_status === 'pending_mate' }"
            >
              <div class="relative shrink-0 w-12 h-12 flex items-center justify-center">
                <!-- Swapped raw image for custom avatar skin component -->
                <UserAvatar
                  :user="person"
                  :customization="hydrateCustomization(person.customization)"
                  size="sm"
                  static
                />

                <!-- Status Dot -->
                <div v-if="isFriendOnline(person._id)"
                     class="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white shadow-sm z-10"></div>

                <!-- Temporary/Pending Icon -->
                <div v-if="person.chat_status === 'temporary' || person.chat_status === 'pending_mate'"
                     class="absolute -top-1 -left-1 bg-secondary text-white rounded-full p-0.5 shadow-sm border border-white animate-pulse z-10">
                  <ion-icon :icon="svg(mdiClockOutline)" class="text-[10px] block" />
                </div>
              </div>

              <div class="ml-4 flex-1 truncate">
                <div class="flex items-center gap-2">
                  <p class="font-bold text-black text-lg leading-tight">{{ person.name }}</p>

                  <!-- Status Badge -->
                  <span v-if="person.chat_status === 'temporary'"
                        class="text-[8px] font-black uppercase bg-secondary/20 text-secondary px-1.5 py-0.5 rounded-full">
                    Ink Drying
                  </span>
                  <span v-else-if="person.chat_status === 'pending_mate'"
                        class="text-[8px] font-black uppercase bg-black/10 text-black/40 px-1.5 py-0.5 rounded-full">
                    Pending
                  </span>
                </div>

                <p class="text-[10px] font-black text-black/30 uppercase tracking-widest truncate mt-0.5">
                  {{ person.description || 'Artist' }}
                </p>
              </div>

              <!-- Timer indicator for Temporary Mates -->
              <div v-if="person.expires_at && person.chat_status === 'temporary'" class="mr-2 text-right">
                <p class="text-[9px] font-black text-secondary uppercase">{{ getTimeRemaining(person.expires_at) }}</p>
              </div>

              <ion-icon :icon="chevronForward" class="text-black/10 group-hover:text-secondary transition-colors" />
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="flex-1 flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <ion-icon :icon="peopleOutline" class="text-4xl text-black/5 mb-4" />
            <p class="cabin-sketch-regular text-xl text-black/30">Nothing found here</p>
          </div>

          <ion-infinite-scroll @ionInfinite="loadMore" :disabled="!hasMore">
            <ion-infinite-scroll-content loading-spinner="dots"></ion-infinite-scroll-content>
          </ion-infinite-scroll>
        </section>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import {
	IonPage,
	IonContent,
	IonSpinner,
	IonIcon,
	IonInfiniteScroll,
	IonInfiniteScrollContent,
} from "@ionic/vue";
import { chevronForward, peopleOutline, searchOutline } from "ionicons/icons";
import { storeToRefs } from "pinia";

import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useUserCacheStore } from "@/store/userCache.store";
import SubPageBar from "@/components/general/SubPageBar.vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue"; // <-- Added import
import { hydrateCustomization } from "@/config/profile_options.config"; // <-- Added import
import { svg } from "@/helper/general.helper";
import { mdiClockOutline } from "@mdi/js";
import dayjs from "dayjs";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";

const route = useRoute();
const activeTab = ref<"mates" | "following" | "followers">(
	(route.query.tab as any) || "mates",
);
const searchQuery = ref("");
const currentPage = ref(1);
let debounceTimeout: any = null;

const friendStore = useFriendStore();
const userCache = useUserCacheStore();
const { user } = storeToRefs(useAuthStore());
const { networkLists, networkLoading, hasMore, isFriendOnline } =
	storeToRefs(friendStore);
const { openUserActions } = useUserContextSheet();

// Merges the locally stored relationship logic with the globally cached profile info
const currentList = computed(() => {
	const entries = networkLists.value[activeTab.value] || [];
	return entries.map((entry) => {
		const cachedProfile = userCache.getUser(entry._id);
		return {
			...(cachedProfile || {
				_id: entry._id,
				name: "Artist",
				img: "",
				description: "",
				customization: undefined,
			}),
			...entry,
		};
	});
});

const fetchData = async (reset = false) => {
	if (!user.value?._id) return;
	if (reset) currentPage.value = 1;

	// Use search only if it meets the 3-char minimum
	const term = searchQuery.value.length >= 3 ? searchQuery.value : "";
	await friendStore.getNetworkList(
		activeTab.value,
		user.value._id,
		currentPage.value,
		term,
	);
};

const switchTab = (tab: "mates" | "following" | "followers") => {
	activeTab.value = tab;
	searchQuery.value = "";
	fetchData(true);
};

const handleSearch = () => {
	clearTimeout(debounceTimeout);
	debounceTimeout = setTimeout(() => fetchData(true), 400);
};

const loadMore = async (ev: any) => {
	currentPage.value++;
	await fetchData();
	ev.target.complete();
};

function getTimeRemaining(expiryDate: string | undefined): string {
	if (!expiryDate) return "";

	const now = dayjs();
	const end = dayjs(expiryDate);

	if (end.isBefore(now)) return "Expired";

	const diffHours = end.diff(now, "hour");
	const diffMinutes = end.diff(now, "minute") % 60;

	if (diffHours > 0) {
		return `${diffHours}h ${diffMinutes}m`;
	}

	return `${diffMinutes}m`;
}

onMounted(() => fetchData(true));
</script>