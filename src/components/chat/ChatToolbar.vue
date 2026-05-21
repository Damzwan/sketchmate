<template>
  <div
    v-if="activeTab !== 'overview'"
    class="flex flex-col bg-white/10 shrink-0 border-b border-white/10 cabin-sketch-regular"
  >
    <div class="flex items-center justify-between px-4 pt-3 pb-2">
      <!-- Clickable Profile Area -->
      <div
        class="flex items-center gap-3 min-w-0 cursor-pointer group active:scale-[0.98] transition-all"
        @click="handleHeaderClick"
      >
        <!-- Avatar Wrapper -->
        <div v-if="activeTab !== 'lobby' && partner" class="relative shrink-0">
          <img
            :src="partner.img"
            class="w-10 h-10 rounded-xl object-cover border-2 shadow-sm transition-all group-hover:border-secondary/50"
            :class="isExpired ? 'border-zinc-300 grayscale-[0.4]' : 'border-white'"
          />

          <div
            class="absolute -right-1.5 -bottom-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-md border border-zinc-100 transition-transform group-hover:scale-110">
            <ion-icon :icon="svg(mdiChevronRight)" class="text-[12px] text-secondary" />
          </div>
        </div>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1.5">
            <span
              class="text-sm font-black italic leading-none truncate tracking-tight transition-colors"
              :class="isExpired ? 'text-zinc-600' : 'text-black'"
            >
              {{ panelTitle }}
            </span>
          </div>

          <div class="flex items-center mt-1">
            <span v-if="activeTab !== 'lobby'" class="text-[9px] font-bold uppercase tracking-widest">

              <template v-if="isExpired">
                <span class="text-zinc-400 font-black">Archived History</span>
              </template>

              <!-- Only show Online/Offline if we are actively tracking them -->
              <template v-else-if="isTrackingOnline">
                <span v-if="isOnline" class="text-green-600">Online</span>
                <span v-else class="text-black/30">Offline</span>
              </template>

              <!-- Safe fallback for strangers / pending invites -->
              <template v-else>
                <span class="text-black/30">Artist</span>
              </template>

            </span>
            <span v-else class="text-[9px] font-bold uppercase tracking-widest text-secondary">
               {{ isPublicLobby ? 'Public Canvas' : 'Private Session' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          v-if="activeTab === 'lobby'"
          @click="openRoomMenu"
          class="p-2 rounded-xl bg-white/40 border border-white/60 active:scale-90 transition-all shadow-sm"
        >
          <ion-icon :icon="svg(mdiCog)" class="text-secondary text-lg" />
        </button>

        <button
          v-else
          @click="$emit('open-report', partner)"
          class="p-2 rounded-xl active:scale-90 transition-all hover:bg-white/40"
        >
          <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-black/40 text-xl" />
        </button>
      </div>
    </div>

    <LobbyMemberBar
      v-if="activeTab === 'lobby'"
      :members="roomMembers"
      :currentUserId="user?._id"
      @inspect="(ev, member) => $emit('inspect-profile', ev, member)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { IonIcon } from "@ionic/vue";
import { mdiCog, mdiDotsHorizontal, mdiChevronRight } from "@mdi/js";
import { svg } from "@/helper/general.helper";

import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useFriendStore } from "@/store/friend.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";
import LobbyMemberBar from "./LobbyMemberBar.vue";

const chatWidget = useChatWidgetStore();
const chatStore = useChatStore();
const friendStore = useFriendStore();
const drawSyncer = useDrawSyncer();
const authStore = useAuthStore();
const menuStore = useMenuStore();

const { activeTab } = storeToRefs(chatWidget);
const { activeChats } = storeToRefs(chatStore);
const { user } = storeToRefs(authStore);
const { isPublicLobby, publicLobbyName, roomMembers } = storeToRefs(drawSyncer);

const emit = defineEmits(["inspect-profile", "open-report"]);

// 1. Unified conversation resolver to clean up the code below
const activeConversation = computed(() => {
	if (activeTab.value === "overview" || activeTab.value === "lobby")
		return null;
	return [...activeChats.value, ...friendStore.pendingRequests].find((c) => {
		return (
			c._id === activeTab.value ||
			c.participants.some((p) => p._id === activeTab.value)
		);
	});
});

// 2. Resolve the partner
const partner = computed(() => {
	if (activeTab.value === "overview" || activeTab.value === "lobby")
		return null;
	if (activeConversation.value) {
		return activeConversation.value.participants.find(
			(p: any) => p._id !== user.value?._id,
		);
	}
	return friendStore.resolvePartnerInfo(activeTab.value);
});

// 3. Centralized status check
const chatStatus = computed(
	() =>
		activeConversation.value?.status || partner.value?.chat_status || "none",
);

const isExpired = computed(() => chatStatus.value === "expired");

const isTrackingOnline = computed(() => {
	return ["mate", "temporary", "pending_mate"].includes(
		chatStatus.value as string,
	);
});

const panelTitle = computed(() => {
	if (activeTab.value === "lobby") {
		return isPublicLobby.value ? publicLobbyName.value : "Session Lobby";
	}
	if (!activeConversation.value && partner.value) {
		return `New Chat: ${partner.value.name.split(" ")[0]}`;
	}
	return partner.value?.name || "Chat";
});

const isOnline = computed(() => {
	if (!partner.value || !isTrackingOnline.value) return false;
	return friendStore.isFriendOnline(partner.value._id);
});

const handleHeaderClick = (event: Event) => {
	if (activeTab.value === "lobby" || !partner.value) return;
	emit("inspect-profile", event, partner.value);
};

const openRoomMenu = () => {
	chatWidget.closePanel();
	menuStore.openMenu(Menu.DrawRoomMenu);
};
</script>