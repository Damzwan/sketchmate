<template>
  <div
    v-if="previewMode || activeTab !== 'overview'"
    class="relative flex flex-col shrink-0 border-b overflow-hidden chat-widget-chrome"
    :style="toolbarStyle"
  >
    <div class="relative z-10 flex items-center justify-between px-4 pt-2 pb-2">
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
              :style="(!isExpired && activeTab !== 'lobby')
                ? {
                    color: activeColors.name,
                    fontFamily: resolvedFontFamily,
                    textShadow: fontEffectClass ? undefined : activeColors.textShadow,
                  }
                : {}"
            >
              {{ panelTitle }}
            </span>

            <ion-icon
              v-if="activeTab === 'lobby'"
              :icon="svg(mdiChevronRight)"
              class="text-sm text-secondary transition-transform group-hover:translate-x-0.5"
            />
          </div>

          <div class="flex items-center mt-0.5 leading-none">
            <span
              v-if="activeTab !== 'lobby'"
              class="text-[10px] font-extrabold uppercase tracking-[0.12em] leading-none"
              :style="statusMetaStyle"
            >
              <template v-if="isExpired">
                <span class="text-black/30">Archived History</span>
              </template>
              <template v-else-if="isTrackingOnline">
                <span v-if="isOnline" :style="{ color: onlineStatusColor }">Online</span>
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
          class="m-0"
          :style="{ '--color': toolbarUtilityColor }"
        >
          <ion-icon
            :icon="svg(mdiDotsHorizontal)"
            class="text-lg"
            slot="icon-only"
            :style="{ color: toolbarUtilityColor }"
          />
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

    <!-- Ambient relationship status lives with the person it's about, pinned
         under their name, permanently. Costs one line and never has to be
         dismissed — which is the whole reason the banner no longer carries
         trials, sent invites or pending mate requests. -->
    <ChatRelationshipStrip
      v-if="!previewMode && activeTab !== 'lobby' && activeConversation"
      :chat="activeConversation"
      :current-user-id="user?._id"
      :dark="stripOnDarkSurface"
      :theme-dark="surfaceColors.isDark"
      :name-color="surfaceColors.name"
      :desc-color="surfaceColors.desc"
      @open-info="chatWidget.openRelationshipInfo()"
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
import {
	hydrateChatCustomization,
	hydrateCustomization,
	resolveFontEffectClass,
	resolveFontFamily,
	resolveReadableCustomizationPalette,
	resolveTheme,
	resolveTitle,
	resolveWorld,
	type ChatCustomization,
} from "@/config/profile_options.config";

import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useFriendStore } from "@/store/friend.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useAuthStore } from "@/store/auth.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import LobbyMemberBar from "./LobbyMemberBar.vue";
import ChatRelationshipStrip from "./ChatRelationshipStrip.vue";

// Optional preview descriptor (shop preview modal) — when set, the toolbar
// renders from these props instead of resolving partner/room from the chat
// stores, so it can be shown outside a live chat as a "here's how it looks".
const props = defineProps<{
	preview?: { partner: any };
	widgetCustomization?: Partial<ChatCustomization>;
}>();
const previewMode = computed(() => !!props.preview);

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
	if (previewMode.value) return props.preview!.partner;
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
const toolbarCustomization = computed(() =>
	hydrateChatCustomization(
		props.widgetCustomization || partnerCustomization.value,
	),
);
const theme = computed(() => resolveTheme(toolbarCustomization.value.themeId));
const resolvedFontFamily = computed(() =>
	resolveFontFamily(toolbarCustomization.value.fontId),
);
const fontEffectClass = computed(() =>
	resolveFontEffectClass(toolbarCustomization.value.fontEffectId),
);

const activeWorld = computed(() =>
	resolveWorld(toolbarCustomization.value.worldId),
);
const surfaceColors = computed(() =>
	resolveReadableCustomizationPalette(theme.value, activeWorld.value),
);
const activeColors = computed(() => surfaceColors.value);
const toolbarUtilityColor = computed(() =>
	showThemeBackdrop.value ? surfaceColors.value.utility : "#18181b",
);
const statusMetaStyle = computed(() => ({
	color: showThemeBackdrop.value ? activeColors.value.desc : "rgba(0,0,0,0.45)",
	fontFamily:
		'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
	textShadow: showThemeBackdrop.value ? activeColors.value.textShadow : "none",
}));
const onlineStatusColor = computed(() =>
	showThemeBackdrop.value && surfaceColors.value.isDark ? "#4ade80" : "#15803d",
);

// The strip shares the widget's full surface. A dark world (not only a dark
// theme) therefore needs the same light palette as the title and utilities.
const stripOnDarkSurface = computed(
	() => showThemeBackdrop.value && surfaceColors.value.isDark,
);

const showThemeBackdrop = computed(
	() => previewMode.value || !!props.widgetCustomization,
);

const toolbarStyle = computed(() =>
	showThemeBackdrop.value
		? {
				background: surfaceColors.value.scrim,
				borderColor: surfaceColors.value.controlBorder,
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
	if (previewMode.value) {
		const title = resolveTitle(partnerCustomization.value.titleId);
		return title
			? `${partner.value?.name} • ${title}`
			: (partner.value?.name ?? "Chat");
	}
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

<style scoped>
.chat-widget-chrome {
	background: var(--chat-widget-scrim, var(--ion-color-background));
	border-color: var(--chat-widget-border, rgba(0,0,0,0.08));
}
</style>
