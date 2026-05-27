<template>
  <div
    v-if="activeTab !== 'overview'"
    class="flex flex-col bg-white/30 shrink-0 border-b border-primary/10"
  >
    <div class="flex items-center justify-between px-4 pt-3 pb-2.5">
      <div
        class="flex items-center gap-3 min-w-0 cursor-pointer group active:scale-[0.99] transition-all"
        @click="handleHeaderClick"
      >
        <div v-if="activeTab !== 'lobby' && partner" class="relative shrink-0 flex items-center justify-center">
          <UserAvatar
            :user="partner"
            :customization="partnerCustomization"
            size="sm"
            class="transition-transform duration-300 group-hover:scale-105"
            :class="isExpired ? 'grayscale opacity-70' : ''"
          />

          <div
            class="absolute -right-1 -bottom-1 w-4 h-4 bg-white rounded-full flex items-center justify-center shadow-sm border border-black/5 transition-transform group-hover:scale-110 z-20"
          >
            <ion-icon :icon="svg(mdiChevronRight)" class="text-[10px] text-secondary" />
          </div>
        </div>

        <div class="flex flex-col min-w-0 justify-center">
          <div class="flex items-center gap-1.5 leading-none">
            <span
              class="text-[15px] font-black leading-none truncate tracking-tight transition-colors drop-shadow-sm"
              :class="[
                isExpired ? 'text-black/40' : 'text-black',
                !isExpired ? fontEffectClass : ''
              ]"
              :style="!isExpired ? { color: theme.nameColor, fontFamily: resolvedFontFamily } : {}"
            >
              {{ panelTitle }}
            </span>
          </div>

          <div class="flex items-center mt-1 leading-none">
            <span v-if="activeTab !== 'lobby'" class="text-[8px] font-black uppercase tracking-widest leading-none">
              <template v-if="isExpired">
                <span class="text-black/30">Archived History</span>
              </template>
              <template v-else-if="isTrackingOnline">
                <span v-if="isOnline" class="text-green-600 font-bold">Online</span>
                <span v-else class="text-black/30">Offline</span>
              </template>
              <template v-else>
                <span class="text-black/30">Artist</span>
              </template>
            </span>
            <span v-else class="text-[8px] font-black uppercase tracking-widest text-secondary leading-none">
               {{ isPublicLobby ? 'Public Canvas' : 'Private Session' }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex items-center gap-1.5 shrink-0">
        <button
          v-if="activeTab === 'lobby'"
          @click="openRoomMenu"
          class="p-2 rounded-xl bg-white/60 border border-primary/20 active:scale-90 transition-all shadow-sm text-secondary"
        >
          <ion-icon :icon="svg(mdiCog)" class="text-base" />
        </button>

        <button
          v-else
          @click="$emit('open-report', partner)"
          class="p-2 rounded-xl active:scale-90 transition-all text-black/30 hover:text-black"
        >
          <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-lg" />
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

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import {
	hydrateCustomization,
	resolveTheme,
	resolveFontFamily,
	resolveFontEffectClass,
	resolveTitle,
} from "@/config/profile_options.config";

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

const partnerCustomization = computed(() =>
	hydrateCustomization(partner.value?.customization),
);
const theme = computed(() => resolveTheme(partnerCustomization.value.themeId));
const resolvedFontFamily = computed(() =>
	resolveFontFamily(partnerCustomization.value.fontId),
);
const fontEffectClass = computed(() =>
	resolveFontEffectClass(partnerCustomization.value.fontEffectId),
);

const chatStatus = computed(
	() =>
		activeConversation.value?.status || partner.value?.chat_status || "none",
);
const isExpired = computed(() => chatStatus.value === "expired");
const isTrackingOnline = computed(() =>
	["mate", "temporary", "pending_mate"].includes(chatStatus.value as string),
);

const panelTitle = computed(() => {
	if (activeTab.value === "lobby")
		return isPublicLobby.value ? publicLobbyName.value : "Session Lobby";
	if (!activeConversation.value && partner.value)
		return `New Chat: ${partner.value.name.split(" ")[0]}`;
	const title = resolveTitle(partnerCustomization.value.titleId);
	if (partner.value)
		return title ? `${partner.value.name} • ${title}` : partner.value.name;
	return "Chat";
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