<template>
  <ion-modal
    :is-open="sharePostMenuOpen"
    @did-dismiss="handleDismiss"
    @ionWillPresent="onWillPresent"
    :initial-breakpoint="1"
    :breakpoints="[0, 1]"
    handle-behavior="cycle"
    class="liquid-title-modal"
  >

    <div
      @touchmove.stop
      class="max-h-[60vh] flex flex-col p-5 bot-pad-safe bg-background cabin-sketch-regular overflow-hidden relative"
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-4 pt-2 shrink-0">
        <span class="text-2xl font-black text-secondary tracking-tighter italic leading-none">Share Sketch</span>
        <button
          @click="handleDismiss"
          class="text-xs font-black text-black/40 uppercase tracking-widest active:opacity-50"
        >
          Cancel
        </button>
      </div>

      <!-- Preview of post being shared -->
      <div v-if="post" class="flex items-center mb-4 bg-white/40 border border-white p-2 rounded-2xl shrink-0">
        <div class="w-12 h-12 rounded-xl overflow-hidden bg-black/5 shrink-0">
          <img :src="post.thumbnail_url" class="w-full h-full object-cover" />
        </div>
        <p class="ml-3 text-sm font-bold text-black/60 italic truncate">
          Sharing {{ post.author.name }}'s post...
        </p>
      </div>

      <!-- List Container -->
      <div
        ref="scrollContainer"
        @touchmove.stop
        class="flex-1 overflow-y-auto overscroll-contain px-1 space-y-3 hide-scrollbar pb-4 scroll-mask"
      >
        <!-- Loading -->
        <div v-if="loading && friends.length === 0" class="flex justify-center py-12">
          <ion-spinner name="bubbles" color="secondary" />
        </div>

        <!-- Empty -->
        <div
          v-else-if="friends.length === 0"
          class="text-center py-12 bg-white/20 rounded-[2.5rem] border-2 border-dashed border-black/5"
        >
          <p class="text-sm font-bold text-black/30 italic">No mates yet. Start sketching!</p>
        </div>

        <!-- List -->
        <div v-else class="space-y-3 mt-2">
          <p class="text-[10px] font-black text-black/30 uppercase px-2 tracking-widest mb-1">
            Your Mates
          </p>

          <button
            v-for="friend in sortedFriends"
            :key="friend._id"
            :disabled="isFriendDisabled(friend) || isSending"
            @click="!isFriendDisabled(friend) && toggleFriend(friend._id)"
            :class="[
              'w-full flex items-center p-3 rounded-[2rem] border transition-all duration-300 relative text-left',
              isFriendDisabled(friend)
                ? 'bg-white/10 border-black/5 opacity-40 cursor-not-allowed grayscale'
                : isSending
                  ? 'bg-white/40 border-white opacity-50 cursor-wait'
                  : selectedFriendIds.includes(friend._id)
                    ? 'bg-secondary/20 border-secondary shadow-inner scale-[0.99]'
                    : 'bg-white/40 border-white shadow-sm active:scale-[0.97] cursor-pointer hover:bg-white/60'
            ]"
          >
            <div class="relative shrink-0 w-12 h-12 rounded-full bg-white/80 shadow-inner overflow-hidden border border-black/5">
              <img v-if="friend.img" :src="friend.img" class="w-full h-full object-cover" />
            </div>

            <div class="flex flex-col ml-4 flex-1 min-w-0">
              <span class="text-lg font-black text-black leading-none truncate">{{ friend.name }}</span>
              <span
                v-if="isFriendDisabled(friend)"
                class="text-[9px] font-bold text-red-500 uppercase tracking-widest mt-1"
              >
                Needs update
              </span>
              <span
                v-else-if="isFriendOnline(friend._id)"
                class="text-[9px] font-bold text-green-600 uppercase tracking-widest mt-1"
              >
                Online now
              </span>
            </div>

            <!-- Checkbox / Selection state indicator -->
            <div
              v-if="!isFriendDisabled(friend)"
              :class="[
                'w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300',
                selectedFriendIds.includes(friend._id)
                  ? 'border-secondary bg-secondary text-white'
                  : 'border-black/5 bg-black/5 text-black/20'
              ]"
            >
              <ion-icon
                :icon="svg(mdiCheck)"
                class="text-base font-black"
              />
            </div>
          </button>
        </div>
      </div>

      <!-- Persistent Sticky Action Footer -->
      <ion-fab
        v-if="selectedFriendIds.length > 0"
        vertical="bottom"
        horizontal="end"
        class="mb-4 mr-2 fixed"
      >
        <ion-fab-button
          color="secondary"
          :disabled="isSending"
          @click="sendToAllSelected"
        >
          <ion-spinner v-if="isSending" name="dots" />
          <div v-else class="flex flex-col items-center justify-center leading-none mt-0.5">
            <ion-icon :icon="svg(mdiSendOutline)" class="text-xl transform -rotate-12" />
            <span class="text-[10px] font-black tracking-tighter">{{ selectedFriendIds.length }}</span>
          </div>
        </ion-fab-button>
      </ion-fab>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IonModal, IonSpinner, IonIcon, IonButton } from "@ionic/vue";
import { mdiSendOutline, mdiCheck } from "@mdi/js";
import { storeToRefs } from "pinia";
import { svg, compareVersions } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { usePostStore } from "@/store/post.store";
import { useMenuStore } from "@/store/menu.store";
import { useChatStore } from "@/store/chat.store";
import { useToast } from "@/service/toast.service";
import { Menu } from "@/draw/types/draw.types";

const authStore = useAuthStore();
const friendStore = useFriendStore();
const postStore = usePostStore();
const menuStore = useMenuStore();
const chatStore = useChatStore();
const { toast } = useToast();

const { allConnectedPartners, isFriendOnline } = storeToRefs(friendStore);
const { sharePostMenuOpen } = storeToRefs(menuStore);
const { activePostToShare: post } = storeToRefs(postStore);

const minChatVersion = "0.4.0";
const loading = ref(false);
const isSending = ref(false);
const selectedFriendIds = ref<string[]>([]);
const scrollContainer = ref<HTMLElement | null>(null);
let matesFetchedThisSession = false;

const onWillPresent = async () => {
	selectedFriendIds.value = [];

	if (!matesFetchedThisSession && authStore.user?._id) {
		matesFetchedThisSession = true;
		if (allConnectedPartners.value.length === 0) loading.value = true;
		try {
			await friendStore.getNetworkList("mates", authStore.user._id, 1);
		} catch (e) {
			console.error("Failed to load mates", e);
		} finally {
			loading.value = false;
		}
	}
};

const friends = computed(() => allConnectedPartners.value);

const isFriendDisabled = (friend: any) =>
	!friend.last_seen_version ||
	compareVersions(friend.last_seen_version, minChatVersion) === -1;

const sortedFriends = computed(() => {
	return [...friends.value].sort((a, b) => {
		const aDisabled = isFriendDisabled(a);
		const bDisabled = isFriendDisabled(b);
		if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;
		const aOnline = isFriendOnline.value(a._id);
		const bOnline = isFriendOnline.value(b._id);
		if (aOnline !== bOnline) return aOnline ? -1 : 1;
		return a.name.localeCompare(b.name);
	});
});

const toggleFriend = (friendId: string) => {
	const index = selectedFriendIds.value.indexOf(friendId);
	if (index > -1) {
		selectedFriendIds.value.splice(index, 1);
	} else {
		selectedFriendIds.value.push(friendId);
	}
};

const sendToAllSelected = async () => {
	if (!post.value || selectedFriendIds.value.length === 0 || isSending.value)
		return;
	isSending.value = true;

	const totalCount = selectedFriendIds.value.length;
	let successCount = 0;

	const promises = selectedFriendIds.value.map(async (friendId) => {
		const existingChat = chatStore.activeChats.find((c) =>
			c.participants.some((p: any) => p._id === friendId),
		);
		const tabId = existingChat?._id || friendId;

		try {
			await chatStore.sendMessage(friendId, "", tabId, post.value!._id, {
				silent: true,
			});
			successCount++;
		} catch (e) {
			console.error(`Failed sharing to friend ${friendId}`, e);
		}
	});

	await Promise.all(promises);

	if (successCount === totalCount) {
		toast(`Shared with ${successCount} mates`, { color: "success" });
		handleDismiss();
	} else if (successCount > 0) {
		toast(`Shared with ${successCount}/${totalCount} mates (some failed)`, {
			color: "warning",
		});
		handleDismiss();
	} else {
		toast("Failed to share with selected mates", { color: "danger" });
	}

	isSending.value = false;
};

const handleDismiss = () => {
	selectedFriendIds.value = [];
	menuStore.closeMenu(Menu.SharePostMenu);
	setTimeout(() => postStore.setActiveSharePost(null), 300);
};
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar { display: none; }
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.overscroll-contain {
  overscroll-behavior: contain;
}

.scroll-mask {
  mask-image: linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0%, black 5%, black 95%, transparent 100%);
}

.animate-slide-up {
  animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

ion-modal.liquid-title-modal {
  --border-radius: 2.5rem 2.5rem 0 0;
  --background: var(--ion-color-tertiary);
  --height: 'auto'
}
ion-modal.liquid-title-modal::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>