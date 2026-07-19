<template>
  <div
    class="flex items-center gap-1 px-3 pt-5 pb-3 min-h-[68px] bg-background rounded-t-[2.5rem] shrink-0"
  >
    <div class="flex-1 flex items-center gap-3 overflow-x-auto hide-scrollbar overflow-visible py-2 pl-1">
    <div
      @click="activeTab = 'overview'"
      class="relative shrink-0 w-11 h-11 rounded-[1.25rem] flex items-center justify-center transition-all duration-300 cursor-pointer"
      :class="
        activeTab === 'overview'
          ? 'bg-secondary text-white shadow-md scale-105'
          : 'bg-secondary/10 text-secondary hover:bg-secondary/15'
      "
    >
      <ion-icon :icon="chatbubblesOutline" class="text-lg" />
      <div
        v-if="unreadConversationsCount > 0 && activeTab !== 'overview'"
        class="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 rounded-full border border-white flex items-center justify-center text-[8px] font-black text-white px-1 shadow-sm"
      >
        {{ unreadConversationsCount }}
      </div>
    </div>

    <div
      v-if="isInLobby || activeChatHeads.length > 0"
      class="h-5 w-[1.5px] bg-primary-shade mx-0.5 shrink-0 rounded-full"
    ></div>

    <div
      v-if="isInLobby"
      @click="activeTab = 'lobby'"
      class="relative shrink-0 w-11 h-11 rounded-[1.25rem] flex items-center justify-center transition-all duration-300 cursor-pointer"
      :class="
        activeTab === 'lobby'
          ? 'bg-cyan-500 shadow-md text-white scale-105'
          : 'bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/15'
      "
    >
      <ion-icon :icon="svg(mdiEarth)" class="text-xl" />
      <div
        v-if="unreadLobbyCount > 0 && activeTab !== 'lobby'"
        class="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 rounded-full border border-white flex items-center justify-center text-[8px] font-black text-white px-1 shadow-sm"
      >
        {{ unreadLobbyCount }}
      </div>
    </div>

    <div
      v-for="head in activeChatHeads"
      :key="head.id"
      @click="activeTab = head.id"
      class="relative shrink-0 w-11 h-11 rounded-[1.25rem] transition-all duration-300 cursor-pointer overflow-visible"
      :class="
        activeTab === head.id
          ? 'ring-2 ring-secondary/80 scale-105 shadow-sm'
          : 'opacity-50 hover:opacity-80'
      "
    >
      <template v-if="getPartner(head.id)">
        <img
          :src="getPartner(head.id)?.img"
          class="w-full h-full rounded-[1.15rem] object-cover"
          :class="{ 'grayscale opacity-50': isExpired(head.id) }"
          alt="avatar"
        />

        <div
          v-if="isPartnerOnline(head.id) && !isExpired(head.id)"
          class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow-sm z-30"
        ></div>
      </template>

      <div
        v-else
        class="w-full h-full bg-primary/20 animate-pulse rounded-[1.15rem] flex items-center justify-center"
      >
        <ion-icon :icon="chatbubblesOutline" class="text-secondary/30 text-sm" />
      </div>

      <div
        v-if="getUnreadCount(head.id) > 0 && activeTab !== head.id"
        class="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 rounded-full border border-white flex items-center justify-center text-[8px] font-black text-white px-1 shadow-sm z-10"
      >
        {{ getUnreadCount(head.id) }}
      </div>

      <div
        v-if="activeTab === head.id"
        @click.stop="chatWidget.removeChatHead(head.id)"
        class="absolute -top-1.5 -left-1.5 w-4.5 h-4.5 bg-black/70 rounded-full flex items-center justify-center z-40 border border-white/20 transition-transform active:scale-75"
      >
        <ion-icon :icon="svg(mdiClose)" class="text-white text-[8px]" />
      </div>
    </div>
    </div>

    <ion-button
      @click="chatWidget.closePanel()"
      aria-label="Close chat"
      fill="clear"
      color="dark"
      class="shrink-0 m-0 active:scale-90 transition-transform"
    >
      <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
    </ion-button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { IonButton, IonIcon } from "@ionic/vue";
import { chatbubblesOutline } from "ionicons/icons";
import { mdiEarth, mdiClose } from "@mdi/js";
import { svg } from "@/helper/general.helper";

import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";

const chatWidget = useChatWidgetStore();
const friendStore = useFriendStore();
const chatStore = useChatStore();
const authStore = useAuthStore();

const { activeTab, activeChatHeads } = storeToRefs(chatWidget);
const { activeChats } = storeToRefs(chatStore);
const { user } = storeToRefs(authStore);
const { roomMembers, lobbyChatMessages } = storeToRefs(useDrawSyncer());

const isInLobby = computed(() => !!roomMembers.value?.length);
const interestingLobbyMessages = computed(() =>
	lobbyChatMessages.value.filter((msg) => msg.type === "message"),
);
const unreadLobbyCount = ref(0);

watch(
	[() => interestingLobbyMessages.value.length, activeTab],
	([newLen, newTab], [oldLen]) => {
		if (newTab === "lobby") {
			unreadLobbyCount.value = 0;
			return;
		}
		if (newTab !== "lobby" && oldLen !== undefined && newLen > oldLen) {
			unreadLobbyCount.value += newLen - oldLen;
		}
	},
);

const getChatFromHead = (headId: string) => {
	return [...activeChats.value, ...friendStore.pendingRequests].find((c) => {
		if (c._id === headId) return true;
		return c.participants.some((p) => p._id === headId);
	});
};

const isExpired = (headId: string) =>
	getChatFromHead(headId)?.status === "expired";

const unreadConversationsCount = computed(() => {
	const me = user.value?._id || "";
	const activeCount = activeChats.value.filter(
		(c) => (c.unread_counts?.[me] || 0) > 0,
	).length;
	const pendingCount = friendStore.pendingRequests.filter(
		(c) => (c.unread_counts?.[me] || 0) > 0,
	).length;
	return activeCount + pendingCount;
});

const getPartner = (headId: string) => {
	const chat = getChatFromHead(headId);
	if (chat)
		return chat.participants.find((p: any) => p._id !== user.value?._id);
	return friendStore.resolvePartnerInfo(headId);
};

const isPartnerOnline = (headId: string) => {
	const partner = getPartner(headId);
	return partner ? friendStore.isFriendOnline(partner._id) : false;
};

const getUnreadCount = (headId: string) => {
	const me = user.value?._id || "";
	return getChatFromHead(headId)?.unread_counts?.[me] || 0;
};
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none !important;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>