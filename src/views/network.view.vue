<template>
  <ion-page class="slide-page">
    <SubPageBar title="My Network" />

    <ion-content class="--background-custom">
      <div class="w-full max-w-2xl mx-auto px-4 pt-4 flex flex-col min-h-full bot-pad-safe">

        <div class="mb-4 p-1 bg-[var(--ion-color-dark)]/5 rounded-[1.5rem] border border-[var(--ion-color-dark)]/10 flex shrink-0 backdrop-blur-sm select-none">
          <button
            v-for="tab in ['mates', 'followers', 'following']"
            :key="tab"
            @click="switchTab(tab as any)"
            class="flex-1 py-2 text-[11px] font-black uppercase tracking-widest rounded-[1.2rem] transition-all"
            :class="activeTab === tab
              ? 'bg-[var(--ion-color-secondary)] text-white shadow-sm'
              : 'text-[var(--ion-color-dark)]/50 hover:text-[var(--ion-color-dark)]'"
          >
            {{ tab }}
          </button>
        </div>

        <div class="relative mb-5 shrink-0">
          <ion-icon :icon="searchOutline" class="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--ion-color-dark)]/30 text-lg" />
          <input
            v-model="searchQuery"
            @input="handleSearch"
            type="text"
            placeholder="Search artists (min. 3 chars)..."
            class="w-full bg-white border border-[var(--ion-color-dark)]/20 rounded-2xl py-3 pl-11 pr-4 text-sm font-bold text-[var(--ion-color-dark)] focus:ring-2 focus:ring-[var(--ion-color-secondary)]/20 transition-all outline-none"
          />
        </div>

        <section
          class="bg-[var(--ion-color-tertiary)] rounded-[2.25rem] p-4.5 border border-[var(--ion-color-dark)]/25 shadow-sm min-h-[450px] flex flex-col mb-10"
        >
          <div class="flex items-baseline justify-between px-1 mb-4 select-none">
            <h3 class="cabin-sketch-regular text-2xl font-black text-[var(--ion-color-dark)] capitalize tracking-tight">
              {{ activeTab }}
            </h3>
            <span v-if="currentList.length && !isQueryTooShort" class="text-[10px] font-black text-[var(--ion-color-dark)]/40 uppercase tracking-widest">
              {{ globalTotalCount }} total
            </span>
          </div>

          <div v-if="networkLoading && currentPage === 1" class="flex-1 flex justify-center items-center py-20">
            <ion-spinner name="dots" color="secondary" />
          </div>

          <div v-else-if="isQueryTooShort" class="flex-1 flex flex-col items-center justify-center py-16 text-center select-none">
            <ion-icon :icon="searchOutline" class="text-4xl text-[var(--ion-color-dark)]/10 mb-3" />
            <p class="cabin-sketch-regular text-base font-black text-amber-700/80 leading-none">
              Type at least 3 characters to filter...
            </p>
          </div>

          <div v-else-if="currentList.length > 0" class="space-y-2.5">
            <div
              v-for="person in currentList"
              :key="person._id"
              @click="openUserActions(person)"
              class="flex items-center p-3 rounded-[1.5rem] transition-all cursor-pointer group"
              :class="[
                person.chat_status === 'temporary' || person.chat_status === 'pending_mate'
                  ? 'bg-[var(--ion-color-secondary)]/10 border-2 border-[var(--ion-color-secondary)]/30'
                  : 'bg-white/50 border border-[var(--ion-color-dark)]/10 shadow-sm hover:border-[var(--ion-color-secondary)]/20'
              ]"
            >
              <div class="relative shrink-0 w-11 h-11 flex items-center justify-center select-none">
                <UserAvatar
                  :user="person"
                  :customization="hydrateCustomization(person.customization)"
                  size="sm"
                  static
                />

                <div
                  v-if="isFriendOnline(person._id)"
                  class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white shadow-sm z-10"
                />

                <div
                  v-if="person.chat_status === 'temporary' || person.chat_status === 'pending_mate'"
                  class="absolute -top-1 -left-1 bg-[var(--ion-color-secondary)] text-white rounded-full p-0.5 border border-white shadow-sm z-10"
                >
                  <ion-icon :icon="svg(mdiClockOutline)" class="text-[9px] block" />
                </div>
              </div>

              <div class="ml-3.5 flex-1 min-w-0">
                <div class="flex items-baseline gap-2 overflow-hidden truncate">
                  <p class="font-black text-[var(--ion-color-dark)] text-base tracking-tight truncate">
                    {{ person.name }}
                  </p>

                  <span
                    v-if="person.chat_status === 'temporary'"
                    class="text-[8px] font-black uppercase bg-[var(--ion-color-secondary)]/15 text-[var(--ion-color-secondary)] px-2 py-0.5 rounded-md shrink-0 tracking-wider"
                  >
                    Temporary Mates
                  </span>
                  <span
                    v-else-if="person.chat_status === 'pending_mate'"
                    class="text-[8px] font-black uppercase bg-[var(--ion-color-dark)]/10 text-[var(--ion-color-dark)]/50 px-2 py-0.5 rounded-md shrink-0 tracking-wider"
                  >
                    Pending Request
                  </span>
                </div>

                <p class="text-[11px] font-bold text-[var(--ion-color-dark)]/60 italic truncate mt-0.5">
                  {{ person.description || 'No custom bio shared yet' }}
                </p>
              </div>

              <div v-if="person.expires_at && person.chat_status === 'temporary'" class="mr-2 text-right shrink-0 select-none">
                <p class="text-[9px] font-black text-[var(--ion-color-secondary)] tracking-wider uppercase">
                  {{ getTimeRemaining(person.expires_at) }}
                </p>
              </div>

              <ion-icon
                :icon="chevronForward"
                class="text-[var(--ion-color-dark)]/20 group-hover:text-[var(--ion-color-secondary)] transition-colors text-base ml-1"
              />
            </div>
          </div>

          <div v-else class="flex-1 flex flex-col items-center justify-center py-16 text-center select-none">
            <ion-icon :icon="peopleOutline" class="text-4xl text-[var(--ion-color-dark)]/10 mb-3" />
            <p class="cabin-sketch-regular text-lg font-black text-[var(--ion-color-dark)]/40 leading-none">
              Nobody listed here yet
            </p>
          </div>

          <ion-infinite-scroll @ionInfinite="loadMore" :disabled="!hasMore || isQueryTooShort" threshold="20%">
            <ion-infinite-scroll-content loading-spinner="dots" />
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
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { hydrateCustomization } from "@/config/profile_options.config";
import { svg } from "@/helper/general.helper";
import { mdiClockOutline } from "@mdi/js";
import dayjs from "dayjs";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";

const route = useRoute();
const activeTab = ref<"mates" | "followers" | "following">(
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

const isQueryTooShort = computed(() => {
	const query = searchQuery.value.trim();
	return query.length > 0 && query.length < 3;
});

// FIXED: Resolves global baseline total calculation directly from the store structure
const globalTotalCount = computed(() => {
	// If your pinia store tracks global totals inside a companion object (e.g., friendStore.totalCounts)
	// return friendStore.totalCounts?.[activeTab.value] || 0;

	// Fallback fallback: if you just want to track hasMore behavior safely
	return friendStore.totalCounts?.[activeTab.value] ?? currentList.value.length;
});

const currentList = computed(() => {
	if (isQueryTooShort.value) return [];

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

	const term = searchQuery.value.trim();

	if (term.length > 0 && term.length < 3) {
		return;
	}

	await friendStore.getNetworkList(
		activeTab.value,
		user.value._id,
		currentPage.value,
		term,
	);
};

const switchTab = (tab: "mates" | "followers" | "following") => {
	activeTab.value = tab;
	searchQuery.value = "";
	fetchData(true);
};

const handleSearch = () => {
	clearTimeout(debounceTimeout);

	const term = searchQuery.value.trim();
	if (term.length === 0) {
		fetchData(true);
		return;
	}

	debounceTimeout = setTimeout(() => fetchData(true), 400);
};

const loadMore = async (ev: any) => {
	if (isQueryTooShort.value) {
		ev.target.complete();
		return;
	}
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

	if (diffHours > 0) return `${diffHours}h ${diffMinutes}m`;
	return `${diffMinutes}m remaining`;
}

onMounted(() => fetchData(true));
</script>

<style scoped>
.--background-custom {
  --background: var(--ion-color-background) !important;
}
</style>