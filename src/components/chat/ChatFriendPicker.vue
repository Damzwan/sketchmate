<template>
  <div class="animate-fade-in flex flex-col gap-3 pb-6 px-0.5">
    <div class="flex items-center justify-between px-1">
      <span class="text-xl font-normal cabin-sketch-regular text-black tracking-tight">New message</span>
      <button
        @click="$emit('cancel')"
        class="text-[9px] font-black text-secondary uppercase tracking-widest active:opacity-50 md:hover:opacity-70"
      >
        Cancel
      </button>
    </div>

    <!-- Add a friend — always available, opens the connection flow -->
    <button
      @click="openConnectionMenu"
      class="group w-full flex items-center gap-3 p-3 rounded-[1.6rem] border border-secondary/40 bg-secondary/5 shadow-sm transition-all active:scale-[0.98] text-left"
    >
      <span class="shrink-0 flex items-center justify-center w-11 h-11 rounded-full bg-secondary text-white shadow-sm transition-transform group-hover:scale-105">
        <ion-icon :icon="svg(mdiAccountPlusOutline)" class="text-xl" />
      </span>
      <div class="flex flex-col min-w-0">
        <span class="text-base leading-none font-black text-black">Add a Friend</span>
        <span class="text-[12px] cabin-sketch-regular text-black/60 mt-0.5">Grow your circle of mates</span>
      </div>
      <ion-icon :icon="svg(mdiChevronRight)" class="ml-auto shrink-0 text-secondary text-lg transition-transform group-hover:translate-x-0.5" />
    </button>

    <!-- Loading state — only show on first ever load -->
    <div v-if="loading && friends.length === 0" class="flex items-center justify-center py-12">
      <ion-spinner name="bubbles" color="secondary" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="friends.length === 0"
      class="text-center py-10 bg-white rounded-[2rem] border border-dashed border-primary/40"
    >
      <p class="cabin-sketch-regular text-base text-black/60">No mates yet. Add a friend above!</p>
    </div>

    <div v-else class="flex flex-col gap-2">
      <p class="text-[9px] font-black text-black/70 uppercase px-1 tracking-widest">
        Your Mates
      </p>

      <button
        v-for="friend in sortedFriends"
        :key="friend._id"
        @click="!isDisabled(friend) && $emit('select-friend', friend)"
        :disabled="isDisabled(friend)"
        class="group relative w-full flex items-center gap-3 p-3 rounded-[1.6rem] border transition-all cursor-pointer overflow-hidden active:scale-[0.98] text-left"
        :class="[
          isDisabled(friend)
            ? 'bg-black/5 border-black/5 opacity-60 grayscale'
            : 'bg-white border-primary/30 shadow-sm hover:border-primary'
        ]"
      >
        <div class="relative shrink-0 flex items-center justify-center">
          <UserAvatar
            :user="friend"
            :customization="friend.customization"
            size="sm"
          />
          <div
            v-if="isFriendOnline(friend._id) && !isDisabled(friend)"
            class="absolute -bottom-0.5 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white z-20"
          ></div>
        </div>

        <div class="flex flex-col flex-1 min-w-0">
          <span class="text-[14px] leading-none font-black truncate tracking-tight text-black">
            {{ friend.name }}
          </span>
          <p class="text-[12px] truncate cabin-sketch-regular tracking-wide pr-2 mt-1 leading-none" :class="isDisabled(friend) ? 'font-bold text-red-500' : 'text-black/60'">
            <span v-if="isDisabled(friend)">Needs update to chat</span>
            <span v-else-if="isFriendOnline(friend._id)" class="text-green-600">Online now</span>
            <span v-else>Offline</span>
          </p>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { IonSpinner, IonIcon } from "@ionic/vue";
import { mdiAccountPlusOutline, mdiChevronRight } from "@mdi/js";
import { compareVersions, svg } from "@/helper/general.helper";

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";

const props = defineProps<{
	minChatVersion: string;
}>();

defineEmits(["cancel", "select-friend"]);

const authStore = useAuthStore();
const friendStore = useFriendStore();
const menuStore = useMenuStore();
const { allConnectedPartners, isFriendOnline } = storeToRefs(friendStore);

const openConnectionMenu = () => menuStore.openMenu(Menu.ConnectionMenu);

const loading = ref(false);

// Module-level flag so we only do the one-time mates fetch once per session.
// If the user closes and reopens the picker, no re-fetch.
let matesFetchedThisSession = false;

/**
 * On first mount, top up the mates list if we haven't already.
 * After that, the cache + chat list keeps things current.
 */
onMounted(async () => {
	if (matesFetchedThisSession || !authStore.user?._id) return;
	matesFetchedThisSession = true;

	// Only show loading spinner if we have nothing to show yet —
	// if `allConnectedPartners` already has data from chats, render
	// immediately and refresh in the background
	if (allConnectedPartners.value.length === 0) loading.value = true;

	try {
		await friendStore.getNetworkList("mates", authStore.user._id, 1);
	} catch (e) {
		console.error("Failed to load mates:", e);
	} finally {
		loading.value = false;
	}
});

const friends = computed(() => allConnectedPartners.value);

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
</script>