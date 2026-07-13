<template>
  <div
    v-if="activeTab !== 'overview'"
    class="relative flex flex-col bg-tertiary shrink-0 border-b border-primary/10 overflow-hidden"
    :style="toolbarStyle"
  >
    <!-- Partner's profile surface, in miniature: their theme cardBg (painted on
         the root above) with their effect + world layered over it, exactly like
         their ProfileCard. Private live chats only (not lobby/expired). -->
    <div v-if="showThemeBackdrop" class="absolute inset-0 z-0 pointer-events-none">
      <ProfileEffect :effect-id="partnerCustomization.effectId" radius-class="rounded-none" />
      <ProfileWorld
        :world-id="partnerCustomization.worldId"
        :accent="theme.accentColor"
        :font="resolvedFontFamily"
        static-mode
        radius-class="rounded-none"
      />
    </div>

    <div class="relative z-10 flex items-center justify-between px-4 pt-3 pb-2.5">
      <div
        class="flex items-center gap-3 min-w-0 cursor-pointer group active:scale-[0.99] transition-all"
        @click="handleHeaderClick"
      >
        <div v-if="activeTab === 'lobby'" class="relative shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-primary/5 text-secondary transition-transform duration-300 group-hover:scale-105">
          <ion-icon :icon="svg(isPublicLobby ? mdiEarth : mdiLockOutline)" class="text-lg" />
        </div>

        <div v-else-if="partner" class="relative shrink-0 flex items-center justify-center">
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
              class="text-lg font-black cabin-sketch-regular leading-none truncate tracking-tight transition-colors drop-shadow-sm"
              :class="[
                isExpired ? 'text-black/40' : 'text-black',
                (!isExpired && activeTab !== 'lobby') ? fontEffectClass : ''
              ]"
              :style="(!isExpired && activeTab !== 'lobby') ? { color: activeColors.name, fontFamily: resolvedFontFamily } : {}"
            >
              {{ panelTitle }}
            </span>

            <ion-icon
              v-if="activeTab === 'lobby'"
              :icon="svg(mdiChevronRight)"
              class="text-sm text-secondary transition-transform group-hover:translate-x-0.5"
            />
          </div>

          <div class="flex items-center mt-1 leading-none">
            <span v-if="activeTab !== 'lobby'" class="text-[8px] font-black uppercase tracking-widest leading-none" :style="showThemeBackdrop ? { color: activeColors.desc } : {}">
              <template v-if="isExpired">
                <span class="text-black/30">Archived History</span>
              </template>
              <template v-else-if="isTrackingOnline">
                <span v-if="isOnline" class="text-green-600 font-bold">Online</span>
                <span v-else :class="showThemeBackdrop ? '' : 'text-black/30'">Offline</span>
              </template>
              <template v-else>
                <span :class="showThemeBackdrop ? '' : 'text-black/30'">Artist</span>
              </template>
            </span>
            <span v-else class="text-xs cabin-sketch-regular uppercase font-bold tracking-widest text-secondary leading-none">
               {{ isPublicLobby ? 'Public Canvas' : 'Private Session' }} · {{ roomMembers.length }} here
            </span>
          </div>
        </div>
      </div>

      <div v-if="activeTab !== 'lobby'" class="flex items-center shrink-0">
        <ion-button
          @click="$emit('open-report', partner)"
          fill="clear"
          color="dark"
        >
          <ion-icon :icon="svg(mdiDotsHorizontal)" class="text-lg" slot="icon-only" />
        </ion-button>
      </div>
    </div>

    <LobbyMemberBar
      v-if="activeTab === 'lobby'"
      class="relative z-10"
      :members="roomMembers"
      :currentUserId="user?._id"
      @inspect="(ev, member) => $emit('inspect-profile', ev, member)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { IonButton, IonIcon } from "@ionic/vue";
import {
	mdiChevronRight,
	mdiDotsHorizontal,
	mdiEarth,
	mdiLockOutline,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";

import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import ProfileEffect from "@/components/profile/customization/ProfileEffect.vue";
import ProfileWorld from "@/components/profile/ProfileWorld.vue";
import {
	hydrateCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveTheme,
	resolveTitle,
	resolveWorld,
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

// World can be dark (space/dragon) — pick the matching name colour so it stays
// readable over the backdrop, same rule ProfileCard/ProfileSheetView use.
const isWorldDark = computed(
	() => resolveWorld(partnerCustomization.value.worldId).isDark === true,
);
const activeColors = computed(() => ({
	name: isWorldDark.value ? theme.value.nameColorDark : theme.value.nameColor,
	desc: isWorldDark.value ? theme.value.descColorDark : theme.value.descColor,
}));

// Only dress the header with the partner's world/effect for a real, live
// private chat — never the lobby or an archived (expired) thread.
const showThemeBackdrop = computed(
	() => activeTab.value !== "lobby" && !!partner.value && !isExpired.value,
);
// Paint the partner's theme surface (cardBg — often a gradient) + themed border
// onto the header root; the effect/world layer sits over it.
const toolbarStyle = computed(() =>
	showThemeBackdrop.value
		? {
				background: theme.value.cardBg,
				borderColor: theme.value.cardBorderColor,
			}
		: {},
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
	if (activeTab.value === "lobby") {
		openRoomMenu();
		return;
	}
	if (!partner.value) return;
	emit("inspect-profile", event, partner.value);
};

const openRoomMenu = () => {
	// Removed chatWidget.closePanel() here to leave underlying chat mounted
	menuStore.openMenu(Menu.DrawRoomMenu);
};
</script>