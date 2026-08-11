<template>
  <ion-modal
    :is-open="viewProfileMenuOpen"
    @did-dismiss="onDismiss"
    :initial-breakpoint="isDesktop ? undefined : 0.95"
    :breakpoints="isDesktop ? undefined : [0, 0.95]"
    :handle="!isDesktop"
    handle-behavior="cycle"
    class="liquid-user-sheet"
    :keepContentsMounted="true"
    :style="{ '--background': theme.cardBg, transition: 'background-color 0.5s ease' }"
  >
    <!-- Keep this sheet's worlds/effects animating when it's the topmost overlay
         above an open photo swiper (flow: swiper → profile tap → this sheet).
         When the swiper opened AFTER the sheet (chat → sheet → swiper) the sheet
         is buried, so it stays frozen by the global ambient pause. -->
    <AmbientScope v-if="contentMounted" :active="isTopmostOverSwiper">
    <ProfileSheetView
      class="rounded-t-[2.5rem]"
      :user="resolvedUser"
      :customization="resolvedCustomization"
      :posts="targetPosts"
      :posts-loading="loadingProfile"
      :stats-loading="loadingProfile"
      :description-loading="loadingProfile"
      @open-post="onOpenPost"
      @go-network="goToNetwork"
    >
      <template #overlay>
        <div class="absolute top-2 right-2 z-20">
          <ion-button
            @click="closeSheet"
            fill="clear"
            class="m-0"
            :style="{ '--color': surfacePalette.utility, color: surfacePalette.utility }"
          >
            <ion-icon :icon="svg(mdiClose)" slot="icon-only" class="text-2xl" />
          </ion-button>
        </div>
      </template>

      <template #avatar-badge>
        <div
          v-if="!isMe && isOnline"
          class="absolute bottom-1 right-1 w-5 h-5 bg-green-500 rounded-full border-4 border-white shadow"
        ></div>
      </template>

      <template #status>
        <div class="flex items-center gap-2 mt-2">
          <span v-if="isMe"
                class="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border"
                :style="statusChipStyle">That's You</span>
          <span v-else-if="isBlocked"
                class="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border"
                :style="statusChipStyle">Blocked</span>
          <span v-else-if="status === 'mate'"
                class="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border"
                :style="statusChipStyle">Mates</span>
          <span v-else-if="status === 'temporary' || status === 'pending_mate'"
                class="bg-secondary text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">Trial Active</span>
          <span v-if="targetProfile?.relationship?.areFollowingMe && !isFollowing && !isMe"
                class="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border"
                :style="statusChipStyle">Follows You</span>
        </div>
      </template>

      <template #actions>
        <div v-if="!isMe" class="mt-8 w-full shrink-0">
            <div
              class="flex flex-col overflow-hidden rounded-[1.5rem] border transition-colors duration-500 shadow-sm backdrop-blur-sm"
              :style="{ borderColor: surfacePalette.controlBorder, backgroundColor: surfacePalette.controlBg }">
              <button
                class="profile-sheet-action flex items-center gap-3 w-full px-5 py-3.5 text-left cursor-pointer transition-colors duration-200 disabled:opacity-50"
                :style="actionStyle"
                @click="primaryCta.handler" :disabled="primaryCta.disabled">
                <ion-icon :icon="svg(primaryCta.icon)" class="text-xl" :style="{ color: theme.accentColor }" />
                <span class="text-sm font-black uppercase tracking-widest"
                      :style="{ color: surfacePalette.name }">{{ primaryCta.label }}</span>
              </button>
              <div class="h-px w-full transition-colors duration-500"
                   :style="{ backgroundColor: surfacePalette.controlBorder }"></div>
              <button
                class="profile-sheet-action flex items-center gap-3 w-full px-5 py-3.5 text-left cursor-pointer transition-colors duration-200"
                :style="actionStyle"
                @click="onToggleFollow">
                <ion-icon :icon="svg(isFollowing ? mdiAccountMinusOutline : mdiAccountPlusOutline)"
                          class="text-xl transition-colors duration-500" :style="{ color: surfacePalette.name }" />
                <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: surfacePalette.name }">{{ isFollowing ? 'Unfollow' : 'Follow' }}</span>
              </button>
              <template v-if="canUnfriend">
                <div class="h-px w-full transition-colors duration-500"
                     :style="{ backgroundColor: surfacePalette.controlBorder }"></div>
                <button
                  class="profile-sheet-action flex items-center gap-3 w-full px-5 py-3.5 text-left cursor-pointer transition-colors duration-200"
                  :style="actionStyle"
                  @click="onUnfriend">
                  <ion-icon :icon="svg(mdiHeartBroken)" class="text-xl transition-colors duration-500"
                            :style="{ color: surfacePalette.desc }" />
                  <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                        :style="{ color: surfacePalette.desc }">{{ status === 'mate' ? 'Unfriend Mate' : 'Cancel Connection'
                    }}</span>
                </button>
              </template>
              <div class="h-px w-full transition-colors duration-500"
                   :style="{ backgroundColor: surfacePalette.controlBorder }"></div>
              <button
                class="profile-sheet-action flex items-center gap-3 w-full px-5 py-3.5 text-left cursor-pointer transition-colors duration-200"
                :style="actionStyle"
                @click="confirmToggleBlock">
                <ion-icon :icon="svg(isBlocked ? mdiAccountReactivateOutline : mdiAccountCancelOutline)"
                          class="text-xl transition-colors duration-500" :style="{ color: surfacePalette.desc }" />
                <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: surfacePalette.name }">{{ isBlocked ? 'Unblock User' : 'Block User' }}</span>
              </button>
              <div class="h-px w-full transition-colors duration-500"
                   :style="{ backgroundColor: surfacePalette.controlBorder }"></div>
              <button
                class="profile-sheet-action flex items-center gap-3 w-full px-5 py-3.5 text-left cursor-pointer transition-colors duration-200"
                :style="actionStyle"
                @click="report">
                <ion-icon :icon="svg(mdiFlagVariantOutline)" class="text-xl transition-colors duration-500"
                          :style="{ color: surfacePalette.desc }" />
                <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: surfacePalette.name }">Report user</span>
              </button>
            </div>
          </div>
      </template>
    </ProfileSheetView>
    </AmbientScope>
  </ion-modal>
</template>

<script setup lang="ts">
import { IonButton, IonIcon, IonModal } from "@ionic/vue";
import {
	mdiAccountCancelOutline,
	mdiAccountMinusOutline,
	mdiAccountPlusOutline,
	mdiAccountReactivateOutline,
	mdiAlertCircleOutline,
	mdiChatOutline,
	mdiClose,
	mdiFlagVariantOutline,
	mdiHeartBroken,
	mdiTimerSandComplete,
} from "@mdi/js";
import { useMediaQuery } from "@vueuse/core";
import { storeToRefs } from "pinia";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import AmbientScope from "@/components/general/AmbientScope.vue";

import ProfileSheetView from "@/components/profile/ProfileSheetView.vue";
import { usePostSwiper } from "@/composables/home/usePostSwiper";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { useConfirm } from "@/composables/useConfirm";
import {
	hydrateCustomization,
	resolveReadableCustomizationPalette,
	resolveTheme,
} from "@/config/profile_options.config";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { compareVersions, svg } from "@/helper/general.helper";
import {
	blockUser,
	unblockUser,
	unfriendUser,
} from "@/service/api/relationship.api";
import { useToast } from "@/service/toast.service";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useFriendStore } from "@/store/friend.store";
import { useMenuStore } from "@/store/menu.store";
import { useModerationStore } from "@/store/moderation.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";

const MIN_CHAT_VERSION = "0.4.3";

const menuStore = useMenuStore();
const authStore = useAuthStore();
const isDesktop = useMediaQuery("(min-width: 768px)");
const chatWidget = useChatWidgetStore();
const friendStore = useFriendStore();
const { closeSheet } = useUserContextSheet();
const { openPostSwiper } = usePostSwiper();
const { toast } = useToast();
const { confirm } = useConfirm();

const swiper = usePhotoSwiper();
const { viewProfileMenuOpen } = storeToRefs(menuStore);
const contentMounted = ref(viewProfileMenuOpen.value);
const lowEnd =
	typeof document !== "undefined" &&
	document.documentElement.classList.contains("low-end");
const CLOSED_CONTENT_TTL_MS = lowEnd ? 3_000 : 15_000;
let contentReleaseTimer: ReturnType<typeof setTimeout> | null = null;

// Stamp when this sheet opens so we can compare against the swiper's open time.
const openedAt = ref(0);
watch(viewProfileMenuOpen, (open) => {
	if (contentReleaseTimer) {
		clearTimeout(contentReleaseTimer);
		contentReleaseTimer = null;
	}
	if (open) {
		contentMounted.value = true;
		openedAt.value = Date.now();
		return;
	}
	contentReleaseTimer = setTimeout(() => {
		contentMounted.value = false;
		contentReleaseTimer = null;
	}, CLOSED_CONTENT_TTL_MS);
});

// Foreground (keep animating) only while this sheet sits ON TOP of an open
// swiper — i.e. it opened at/after the swiper. Otherwise it's either buried
// under the swiper or under some other overlay, and the global pause wins.
const isTopmostOverSwiper = computed(
	() =>
		viewProfileMenuOpen.value &&
		swiper.open &&
		openedAt.value >= swiper.openedAt,
);
const { targetProfile, targetPosts, loadingProfile, isFriendOnline } =
	storeToRefs(friendStore);
const { user: me } = storeToRefs(authStore);

const resolvedUser = computed(() =>
	targetProfile.value?._id ? targetProfile.value : null,
);

const resolvedCustomization = computed<Partial<any>>(() => {
	return (resolvedUser.value?.customization as any) || {};
});
const effectiveCustomization = computed(() =>
	hydrateCustomization(resolvedCustomization.value),
);
const theme = computed(() =>
	resolveTheme(effectiveCustomization.value.themeId),
);
const surfacePalette = computed(() =>
	resolveReadableCustomizationPalette(theme.value),
);
const statusChipStyle = computed(() => ({
	background: surfacePalette.value.controlBg,
	borderColor: surfacePalette.value.controlBorder,
	color: surfacePalette.value.name,
	textShadow: surfacePalette.value.textShadow,
}));
const actionStyle = computed(() => ({
	"--profile-action-active": surfacePalette.value.controlActiveBg,
}));
const isMe = computed(() => targetProfile.value?._id === me.value?._id);
const isBlocked = computed(() =>
	targetProfile.value?._id
		? friendStore.isBlocked(targetProfile.value._id)
		: false,
);
const isOnline = computed(() =>
	targetProfile.value?._id
		? isFriendOnline.value(targetProfile.value._id)
		: false,
);

const status = computed(() => {
	if (!targetProfile.value?._id) return undefined;
	return (
		targetProfile.value.chat_status ||
		friendStore.resolvePartnerInfo(targetProfile.value._id)?.chat_status
	);
});

const isFollowing = computed(() => {
	if (!targetProfile.value?._id) return false;
	if (targetProfile.value.relationship)
		return targetProfile.value.relationship.isFollowing;
	return friendStore.networkLists.following.some(
		(f) => f._id === targetProfile.value?._id,
	);
});

const canUnfriend = computed(() =>
	["mate", "temporary", "pending_mate"].includes(status.value as string),
);

const hasRequiredVersion = computed(() => {
	const v = resolvedUser.value?.last_seen_version;
	return v ? compareVersions(v, MIN_CHAT_VERSION) !== -1 : false;
});

const primaryCta = computed(() => {
	if (isBlocked.value) {
		return {
			label: "User Blocked",
			icon: mdiAccountCancelOutline,
			disabled: true,
			handler: () => {},
		};
	}
	if (!hasRequiredVersion.value) {
		return {
			label: "User needs to update to chat",
			icon: mdiAlertCircleOutline,
			disabled: true,
			handler: () => {},
		};
	}
	if (status.value === "mate") {
		return {
			label: "Message",
			icon: mdiChatOutline,
			disabled: false,
			handler: onStartChat,
		};
	}
	if (["temporary", "pending_mate"].includes(status.value as string)) {
		return {
			label: "Continue Chat",
			icon: mdiTimerSandComplete,
			disabled: false,
			handler: onStartChat,
		};
	}
	return {
		label: "Message",
		icon: mdiChatOutline,
		disabled: false,
		handler: onStartChat,
	};
});

function onDismiss() {
	viewProfileMenuOpen.value = false;
}

function onStartChat() {
	if (!targetProfile.value?._id || !hasRequiredVersion.value) return;
	chatWidget.openChatWithUser(targetProfile.value._id);
	closeSheet();
}

function onOpenPost(index: number) {
	openPostSwiper(targetPosts.value, index);
}

function goToNetwork(_tab: "mates" | "followers" | "following") {
	/* Stub */
}

async function onToggleFollow() {
	if (!targetProfile.value || isMe.value) return;
	const artistName = targetProfile.value.name;
	try {
		const nowFollowing = await friendStore.toggleFollowUser(
			targetProfile.value as any,
		);
		if (targetProfile.value.relationship)
			targetProfile.value.relationship.isFollowing = !!nowFollowing;
		toast(
			nowFollowing ? `Following ${artistName}` : `Unfollowed ${artistName}`,
		);
	} catch {
		toast("Action failed", { color: "danger" });
	}
}

async function onUnfriend() {
	if (!targetProfile.value) return;
	const isPermanent = status.value === "mate";
	const partner = targetProfile.value;

	const shouldRemove = await confirm({
		header: isPermanent ? "Unfriend?" : "End Trial?",
		message: isPermanent
			? `Remove ${partner.name}? Chat invites locked for 48h.`
			: `Stop chatting with ${partner.name}?`,
		cancelText: "Keep",
		confirmText: isPermanent ? "Remove" : "End",
		destructive: true,
	});
	if (!shouldRemove) return;
	try {
		await unfriendUser(partner._id);
		friendStore.removeFriendLocally(partner._id);
		void friendStore.refreshMyStats();
		useChatStore().expireChat(partner._id);
		toast(isPermanent ? `Removed ${partner.name}` : "Trial ended");
		closeSheet();
	} catch {
		toast("Action failed", { color: "danger" });
	}
}

async function confirmToggleBlock() {
	if (!targetProfile.value) return;
	const target = targetProfile.value;

	if (isBlocked.value) {
		try {
			void unblockUser(target._id);
			friendStore.unblockUserLocally(target._id);
			useChatStore().resetChatWithUser(target._id);
			toast(`${target.name} unblocked`);
		} catch {
			toast("Action failed", { color: "danger" });
		}
		return;
	}

	const shouldBlock = await confirm({
		header: "Block User?",
		message: `Are you sure you want to block ${target.name}? They will no longer be able to message you or see your sketches.`,
		confirmText: "Block",
		destructive: true,
	});
	if (!shouldBlock) return;
	try {
		await blockUser(target._id);
		friendStore.blockUserLocally(target._id);
		void friendStore.refreshMyStats();
		if (useDrawSyncer().isLobby) {
			const { useDrawObjectManager } = await import(
				"@/draw/canvas/drawObjectManager"
			);
			useDrawObjectManager().purgeBlockedObjects();
		}
		toast(`${target.name} blocked`);
		closeSheet();
	} catch {
		toast("Action failed", { color: "danger" });
	}
}

function report() {
	const profile = targetProfile.value;
	if (!profile?._id) return;
	useModerationStore().openReport({
		type: "user",
		id: profile._id,
		label: profile.name,
	});
}

onBeforeUnmount(() => {
	if (contentReleaseTimer) clearTimeout(contentReleaseTimer);
});
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.pb-safe {
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);
}

.profile-sheet-action:active {
  background: var(--profile-action-active);
}

ion-modal.liquid-user-sheet {
  --border-radius: 2.5rem 2.5rem 0 0;
}

ion-modal.liquid-user-sheet::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}

@media (min-width: 768px) {
  ion-modal.liquid-user-sheet {
    --width: min(92vw, 60rem);
    --height: min(90vh, 54rem);
    --border-radius: 2rem;
    --box-shadow: 0 28px 90px rgba(19, 12, 35, 0.3);
  }

  ion-modal.liquid-user-sheet::part(content) {
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
}
</style>
