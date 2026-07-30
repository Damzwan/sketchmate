<template>
  <div class="animate-fade-in flex flex-col gap-3 pb-6 px-0.5">
    <div class="flex items-center justify-between px-1">
      <span class="text-xl font-normal cabin-sketch-regular text-black tracking-tight">New message</span>
      <button
        @click="$emit('cancel')"
        class="text-sm cursor-pointer font-black text-secondary uppercase tracking-wide active:opacity-50 md:hover:opacity-70"
      >
        Cancel
      </button>
    </div>

    <!-- Add a friend — always available, opens the connection flow -->
    <button
      @click="openConnectionMenu"
      class="group w-full flex items-center cursor-pointer gap-3 p-3.5 rounded-[1.6rem] border-2 border-secondary/30 bg-tertiary shadow-sm transition-all active:scale-[0.98] md:hover:border-secondary/50 text-left"
    >
      <span class="shrink-0 flex items-center justify-center w-11 h-11 rounded-full bg-secondary text-white shadow-sm transition-transform group-hover:scale-105">
        <ion-icon :icon="svg(mdiAccountPlusOutline)" class="text-xl" />
      </span>
      <div class="flex flex-col min-w-0">
        <span class="text-base leading-tight font-black text-black cabin-sketch-regular">Add a friend</span>
        <span class="text-sm text-black/80 mt-0.5 leading-snug">Grow your circle of mates</span>
      </div>
      <ion-icon :icon="svg(mdiChevronRight)" class="ml-auto shrink-0 text-secondary text-xl transition-transform group-hover:translate-x-0.5" />
    </button>

    <!-- Search -->
    <div class="relative">
      <ion-icon :icon="svg(mdiMagnify)" class="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/80 text-xl pointer-events-none" />
      <input
        v-model="searchQuery"
        @input="handleSearch"
        type="text"
        placeholder="Search mates…"
        class="w-full bg-tertiary border border-primary/30 rounded-2xl py-3 pl-11 pr-10 text-base font-bold text-black placeholder:text-black/50 placeholder:font-normal focus:border-secondary/40 focus:ring-2 focus:ring-secondary/20 transition-all outline-none"
      />
      <button
        v-if="searchQuery"
        @click="clearSearch"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full bg-black/10 text-black/80 active:scale-90 transition-transform cursor-pointer"
        aria-label="Clear search"
      >
        <ion-icon :icon="svg(mdiClose)" class="text-base" />
      </button>
    </div>

    <!-- Loading state — only show on first page load -->
    <div v-if="networkLoading && currentPage === 1" class="flex items-center justify-center py-12">
      <ion-spinner name="bubbles" color="secondary" />
    </div>

    <!-- Query too short hint -->
    <div
      v-else-if="isQueryTooShort"
      class="flex flex-col items-center text-center py-10 px-6 bg-tertiary rounded-[2rem] border border-dashed border-amber-400/60"
    >
      <ion-icon :icon="svg(mdiMagnify)" class="text-3xl text-amber-600 mb-2" />
      <p class="cabin-sketch-regular text-base text-amber-800 leading-snug">
        Keep typing — searching needs at least 3 characters.
      </p>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="sortedFriends.length === 0"
      class="flex flex-col items-center text-center py-10 px-6 bg-tertiary rounded-[2rem] border border-dashed border-primary/40"
    >
      <ion-icon
        :icon="svg(searchQuery.trim() ? mdiMagnify : mdiAccountPlusOutline)"
        class="text-3xl text-black/80 mb-2"
      />
      <p class="cabin-sketch-regular text-base text-black/80 leading-snug">
        {{ searchQuery.trim()
          ? `No mates match “${searchQuery.trim()}”.`
          : 'No mates yet — add a friend above and they’ll show up here.' }}
      </p>
    </div>

    <div v-else class="flex flex-col gap-2.5">
      <p class="text-sm font-black text-black/80 uppercase px-1 tracking-wide">
        Your mates
      </p>

      <button
        v-for="friend in sortedFriends"
        :key="friend._id"
        @click="!isDisabled(friend) && $emit('select-friend', friend)"
        :disabled="isDisabled(friend)"
        class="group flex items-center p-3 rounded-[1.5rem] border transition-all cursor-pointer text-left w-full"
        :class="[
          isDisabled(friend)
            ? 'bg-black/5 border-black/10 opacity-70 grayscale cursor-default'
            : 'bg-tertiary border-primary/30 shadow-sm md:hover:border-secondary/40 active:scale-[0.98]'
        ]"
      >
        <div class="relative shrink-0 flex items-center justify-center select-none">
          <UserAvatar
            :user="friend"
            :customization="hydrateCustomization(friend.customization)"
            size="sm"
            static
          />
          <!-- Ring matches the row surface (tertiary), not white — a cold
               outline on a warm card is the same mismatch the banner had. -->
          <div
            v-if="isFriendOnline(friend._id) && !isDisabled(friend)"
            class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-tertiary shadow-sm z-10"
          ></div>
        </div>

        <div class="ml-3.5 flex-1 min-w-0">
          <p class="font-black text-black text-base tracking-tight truncate cabin-sketch-regular">
            {{ friend.name }}
          </p>
          <p
            class="text-sm font-bold truncate mt-0.5"
            :class="isDisabled(friend) ? 'text-red-600' : isFriendOnline(friend._id) ? 'text-emerald-700' : 'text-black/80'"
          >
            <span v-if="isDisabled(friend)">Needs an update to chat</span>
            <span v-else-if="isFriendOnline(friend._id)">Online now</span>
            <span v-else>Offline</span>
          </p>
        </div>

        <ion-icon
          v-if="!isDisabled(friend)"
          :icon="svg(mdiChevronRight)"
          class="text-black/80 group-hover:text-secondary transition-all text-lg ml-1 shrink-0 group-hover:translate-x-0.5"
        />
      </button>

      <!-- Infinite-scroll sentinel -->
      <div ref="sentinel" class="h-1 w-full shrink-0"></div>
      <div v-if="loadingMore" class="flex items-center justify-center py-3">
        <ion-spinner name="dots" color="secondary" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { IonSpinner, IonIcon } from "@ionic/vue";
import {
	mdiAccountPlusOutline,
	mdiChevronRight,
	mdiClose,
	mdiMagnify,
} from "@mdi/js";
import { compareVersions, svg } from "@/helper/general.helper";

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useUserCacheStore } from "@/store/userCache.store";
import { useMenuStore } from "@/store/menu.store";
import { hydrateCustomization } from "@/config/profile_options.config";
import { Menu } from "@/types/menu.types";

const props = defineProps<{
	minChatVersion: string;
}>();

defineEmits(["cancel", "select-friend"]);

const authStore = useAuthStore();
const friendStore = useFriendStore();
const userCache = useUserCacheStore();
const menuStore = useMenuStore();
const { networkLists, networkLoading, hasMore, isFriendOnline } =
	storeToRefs(friendStore);

const openConnectionMenu = () => menuStore.openMenu(Menu.ConnectionMenu);

const searchQuery = ref("");
const currentPage = ref(1);
const loadingMore = ref(false);
let debounceTimeout: any = null;

const isQueryTooShort = computed(() => {
	const q = searchQuery.value.trim();
	return q.length > 0 && q.length < 3;
});

// Hydrate the relationship entries with cached profile data (name, avatar,
// customization, last_seen_version) — mirrors network.view.
const friends = computed(() => {
	if (isQueryTooShort.value) return [];
	return networkLists.value.mates.map((entry) => {
		const cached = userCache.getUser(entry._id);
		return {
			...(cached || {
				_id: entry._id,
				name: "Artist",
				img: "",
				customization: undefined,
			}),
			...entry,
		} as any;
	});
});

const isDisabled = (friend: any) => {
	return (
		!friend.last_seen_version ||
		compareVersions(friend.last_seen_version, props.minChatVersion) === -1
	);
};

const sortedFriends = computed(() => {
	return [...friends.value].sort((a, b) => {
		const aDisabled = isDisabled(a);
		const bDisabled = isDisabled(b);
		if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;

		const aOnline = isFriendOnline.value(a._id);
		const bOnline = isFriendOnline.value(b._id);
		if (aOnline !== bOnline) return aOnline ? -1 : 1;

		return a.name.localeCompare(b.name);
	});
});

async function fetchData(reset = false) {
	if (!authStore.user?._id) return;
	if (reset) currentPage.value = 1;

	const term = searchQuery.value.trim();
	if (term.length > 0 && term.length < 3) return;

	try {
		await friendStore.getNetworkList(
			"mates",
			authStore.user._id,
			currentPage.value,
			term,
		);
	} catch (e) {
		console.error("Failed to load mates:", e);
	}
}

function handleSearch() {
	clearTimeout(debounceTimeout);
	const term = searchQuery.value.trim();
	if (term.length === 0) {
		fetchData(true);
		return;
	}
	debounceTimeout = setTimeout(() => fetchData(true), 400);
}

function clearSearch() {
	searchQuery.value = "";
	clearTimeout(debounceTimeout);
	fetchData(true);
}

async function loadMore() {
	// `networkLoading` only tracks page 1 in the store, so guard page>1
	// fetches with a local flag — otherwise the observer fires repeatedly
	// and stacks duplicate pages.
	if (
		!hasMore.value ||
		loadingMore.value ||
		networkLoading.value ||
		isQueryTooShort.value
	)
		return;
	loadingMore.value = true;
	currentPage.value++;
	try {
		await fetchData();
	} finally {
		loadingMore.value = false;
	}
}

// Infinite scroll via IntersectionObserver against the viewport — the picker
// flows inside the chat widget's own scroll container (no ion-content), so a
// nested scroll area would clip/shrink the list.
const sentinel = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

function attachObserver() {
	observer?.disconnect();
	if (!sentinel.value) return;
	observer = new IntersectionObserver(
		(entries) => {
			if (entries[0]?.isIntersecting) loadMore();
		},
		{ threshold: 0.1 },
	);
	observer.observe(sentinel.value);
}

// Re-attach whenever the sentinel remounts (list toggles between states).
watch(sentinel, () => attachObserver());

onMounted(() => {
	fetchData(true);
	attachObserver();
});

onBeforeUnmount(() => {
	observer?.disconnect();
	clearTimeout(debounceTimeout);
});
</script>
