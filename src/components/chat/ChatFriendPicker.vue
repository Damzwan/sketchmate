<template>
  <div class="animate-fade-in space-y-6 pb-20 px-2">
    <div class="flex items-center justify-between p-2">
      <span class="text-2xl font-normal cabin-sketch-regular text-black">Select Mate</span>
      <button
        @click="$emit('cancel')"
        class="text-xs font-black text-secondary uppercase tracking-widest active:opacity-50"
      >
        Cancel
      </button>
    </div>

    <!-- Loading state — only show on first ever load -->
    <div v-if="loading && friends.length === 0" class="flex items-center justify-center py-12">
      <ion-spinner name="bubbles" color="secondary" />
    </div>

    <!-- Empty state -->
    <div
      v-else-if="friends.length === 0"
      class="text-center py-12 bg-white/20 rounded-[2.5rem] border-2 border-dashed border-black/5"
    >
      <p class="text-sm font-bold text-black/30 italic">No mates yet. Start sketching!</p>
    </div>

    <div v-else class="space-y-2">
      <p class="text-[10px] font-black text-black/30 uppercase px-2 tracking-widest">
        Your Mates
      </p>

      <button
        v-for="friend in sortedFriends"
        :key="friend._id"
        @click="!isDisabled(friend) && $emit('select-friend', friend)"
        :disabled="isDisabled(friend)"
        class="group relative w-full flex items-center p-3 backdrop-blur-md rounded-[1.5rem] border transition-all cursor-pointer overflow-hidden active:scale-[0.98] text-left"
        :class="[
          isDisabled(friend)
            ? 'bg-zinc-200/40 border-zinc-300/40 opacity-75 grayscale'
            : 'bg-white/40 border-white/60 shadow-sm hover:bg-white/60'
        ]"
      >
        <div class="relative flex-shrink-0 flex items-center justify-center">
          <UserAvatar
            :user="friend"
            :customization="friend.customization"
            size="sm"
            class="shadow-sm transition-all"
          />
          <div
            v-if="isFriendOnline(friend._id) && !isDisabled(friend)"
            class="absolute -bottom-0.5 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white z-20"
          ></div>
        </div>

        <div class="flex flex-col ml-3.5 flex-1 min-w-0">
          <span class="text-base leading-none font-black truncate text-black">
            {{ friend.name }}
          </span>
          <p class="text-[13px] truncate cabin-sketch-regular tracking-wide pr-2 mt-0.5" :class="isDisabled(friend) ? 'font-bold text-red-500' : 'font-bold text-black/60'">
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
import { IonSpinner } from "@ionic/vue";
import { compareVersions } from "@/helper/general.helper";

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";

const props = defineProps<{
	minChatVersion: string;
}>();

defineEmits(["cancel", "select-friend"]);

const authStore = useAuthStore();
const friendStore = useFriendStore();
const { allConnectedPartners, isFriendOnline } = storeToRefs(friendStore);

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