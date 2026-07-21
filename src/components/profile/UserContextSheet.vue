<template>
  <ion-modal
    :is-open="viewProfileMenuOpen"
    @did-dismiss="onDismiss"
    :initial-breakpoint="0.95"
    :breakpoints="[0, 0.95]"
    handle-behavior="cycle"
    class="liquid-user-sheet"
    :keepContentsMounted="true"
    :style="{ '--background': theme.cardBg, transition: 'background-color 0.5s ease' }"
  >
    <!-- Keep this sheet's worlds/effects animating when it's the topmost overlay
         above an open photo swiper (flow: swiper → profile tap → this sheet).
         When the swiper opened AFTER the sheet (chat → sheet → swiper) the sheet
         is buried, so it stays frozen by the global ambient pause. -->
    <AmbientScope :active="isTopmostOverSwiper">
    <ProfileSheetView
      class="rounded-t-[2.5rem]"
      :user="resolvedUser"
      :customization="resolvedCustomization"
      :posts="targetPosts"
      :posts-loading="loadingProfile"
      :stats-loading="loadingProfile"
      @open-post="onOpenPost"
      @go-network="goToNetwork"
    >
      <template #overlay>
        <div class="absolute top-2 right-2 z-20">
          <ion-button @click="closeSheet" fill="clear" class="m-0" :style="{color: theme.nameColor}">
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
                class="bg-secondary/10 text-secondary text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">That's You</span>
          <span v-else-if="isBlocked"
                class="bg-black/10 text-black/80 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Blocked</span>
          <span v-else-if="status === 'mate'"
                class="bg-secondary/10 text-secondary text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest border border-secondary/20">Mates</span>
          <span v-else-if="status === 'temporary' || status === 'pending_mate'"
                class="bg-secondary text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">Trial Active</span>
          <span v-if="targetProfile?.relationship?.areFollowingMe && !isFollowing && !isMe"
                class="bg-black/5 text-black/80 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">Follows You</span>
        </div>
      </template>

      <template #description>
        <div v-if="loadingProfile && !resolvedUser?.description"
             class="mt-4 flex flex-col items-center gap-1.5 w-full px-8">
          <div class="h-3.5 w-full bg-black/5 rounded-full animate-pulse"></div>
          <div class="h-3.5 w-2/3 bg-black/5 rounded-full animate-pulse"></div>
        </div>
        <p v-else
           class="text-sm font-bold italic mt-4 leading-snug whitespace-pre-wrap px-2 transition-colors duration-500"
           :style="{ color: theme.descColor }">
          "{{ resolvedUser?.description || 'This artist is a mystery...' }}"
        </p>
      </template>

      <template #actions>
        <div v-if="!isMe" class="mt-8 w-full shrink-0">
            <div
              class="flex flex-col overflow-hidden rounded-[1.5rem] border transition-colors duration-500 shadow-sm backdrop-blur-sm"
              :style="{ borderColor: theme.cardBorderColor, backgroundColor: 'rgba(255, 255, 255, 0.15)' }">
              <button
                class="flex items-center gap-3 w-full px-5 py-3.5 text-left active:bg-black/5 cursor-pointer transition-colors duration-200"
                @click="primaryCta.handler" :disabled="primaryCta.disabled">
                <ion-icon :icon="svg(primaryCta.icon)" class="text-xl" :style="{ color: theme.accentColor }" />
                <span class="text-sm font-black uppercase tracking-widest"
                      :style="{ color: theme.nameColor }">{{ primaryCta.label }}</span>
              </button>
              <div class="h-px w-full transition-colors duration-500"
                   :style="{ backgroundColor: theme.cardBorderColor }"></div>
              <button
                class="flex items-center gap-3 w-full px-5 py-3.5 text-left active:bg-black/5 cursor-pointer transition-colors duration-200"
                @click="onToggleFollow">
                <ion-icon :icon="svg(isFollowing ? mdiAccountMinusOutline : mdiAccountPlusOutline)"
                          class="text-xl transition-colors duration-500" :style="{ color: theme.nameColor }" />
                <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: theme.nameColor }">{{ isFollowing ? 'Unfollow' : 'Follow' }}</span>
              </button>
              <template v-if="canUnfriend">
                <div class="h-px w-full transition-colors duration-500"
                     :style="{ backgroundColor: theme.cardBorderColor }"></div>
                <button
                  class="flex items-center gap-3 w-full px-5 py-3.5 text-left active:bg-black/5 cursor-pointer transition-colors duration-200"
                  @click="onUnfriend">
                  <ion-icon :icon="svg(mdiHeartBroken)" class="text-xl transition-colors duration-500"
                            :style="{ color: theme.descColor }" />
                  <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                        :style="{ color: theme.descColor }">{{ status === 'mate' ? 'Unfriend Mate' : 'Cancel Connection'
                    }}</span>
                </button>
              </template>
              <div class="h-px w-full transition-colors duration-500"
                   :style="{ backgroundColor: theme.cardBorderColor }"></div>
              <button
                class="flex items-center gap-3 w-full px-5 py-3.5 text-left active:bg-black/5 cursor-pointer transition-colors duration-200"
                @click="confirmToggleBlock">
                <ion-icon :icon="svg(isBlocked ? mdiAccountReactivateOutline : mdiAccountCancelOutline)"
                          class="text-xl transition-colors duration-500" :style="{ color: theme.descColor }" />
                <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: theme.nameColor }">{{ isBlocked ? 'Unblock User' : 'Block User' }}</span>
              </button>
              <div class="h-px w-full transition-colors duration-500"
                   :style="{ backgroundColor: theme.cardBorderColor }"></div>
              <button
                class="flex items-center gap-3 w-full px-5 py-3.5 text-left active:bg-black/5 cursor-pointer transition-colors duration-200"
                @click="report">
                <ion-icon :icon="svg(mdiFlagVariantOutline)" class="text-xl transition-colors duration-500"
                          :style="{ color: theme.descColor }" />
                <span class="text-sm font-black uppercase tracking-widest transition-colors duration-500"
                      :style="{ color: theme.nameColor }">Report user</span>
              </button>
            </div>
          </div>
      </template>
    </ProfileSheetView>
    </AmbientScope>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { alertController, IonButton, IonIcon, IonModal } from "@ionic/vue";
import {
	mdiAccountCancelOutline,
	mdiAccountMinusOutline,
	mdiAccountPlusOutline,
	mdiAccountReactivateOutline,
	mdiAlertCircleOutline,
	mdiChatOutline,
	mdiHeartBroken,
	mdiTimerSandComplete,
	mdiFlagVariantOutline,
	mdiClose,
} from "@mdi/js";
import { compareVersions, svg } from "@/helper/general.helper";

import ProfileSheetView from "@/components/profile/ProfileSheetView.vue";
import AmbientScope from "@/components/general/AmbientScope.vue";

import { useAuthStore } from "@/store/auth.store";
import { usePhotoSwiper } from "@/store/photoswiper.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useFriendStore } from "@/store/friend.store";
import { useMenuStore } from "@/store/menu.store";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import { usePostSwiper } from "@/composables/home/usePostSwiper";

import {
	blockUser,
	unblockUser,
	unfriendUser,
} from "@/service/api/relationship.api";
import { useToast } from "@/service/toast.service";
import {
	hydrateCustomization,
	resolveTheme,
} from "@/config/profile_options.config";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useDrawObjectManager } from "@/draw/store/drawObjectManager.store";
import { useChatStore } from "@/store/chat.store";
import { useModerationStore } from "@/store/moderation.store";

const MIN_CHAT_VERSION = "0.4.3";

const menuStore = useMenuStore();
const authStore = useAuthStore();
const chatWidget = useChatWidgetStore();
const friendStore = useFriendStore();
const { closeSheet } = useUserContextSheet();
const { openPostSwiper } = usePostSwiper();
const { toast } = useToast();

const swiper = usePhotoSwiper();
const { viewProfileMenuOpen } = storeToRefs(menuStore);

// Stamp when this sheet opens so we can compare against the swiper's open time.
const openedAt = ref(0);
watch(viewProfileMenuOpen, (open) => {
	if (open) openedAt.value = Date.now();
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
		(targetProfile.value as any).chat_status ||
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

	const alert = await alertController.create({
		header: isPermanent ? "Unfriend?" : "End Trial?",
		cssClass: "liquid-alert",
		message: isPermanent
			? `Remove ${partner.name}? Chat invites locked for 48h.`
			: `Stop chatting with ${partner.name}?`,
		buttons: [
			{ text: "Keep", role: "cancel" },
			{
				text: isPermanent ? "Remove" : "End",
				role: "destructive",
				handler: async () => {
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
				},
			},
		],
	});
	await alert.present();
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

	const alert = await alertController.create({
		header: "Block User?",
		message: `Are you sure you want to block ${target.name}? They will no longer be able to message you or see your sketches.`,
		cssClass: "liquid-alert",
		buttons: [
			{ text: "Cancel", role: "cancel" },
			{
				text: "Block",
				role: "destructive",
				handler: async () => {
					try {
						await blockUser(target._id);
						friendStore.blockUserLocally(target._id);
						void friendStore.refreshMyStats();
						if (useDrawSyncer().isLobby) {
							useDrawObjectManager().purgeBlockedObjects();
						}

						toast(`${target.name} blocked`);
						closeSheet();
					} catch {
						toast("Action failed", { color: "danger" });
					}
				},
			},
		],
	});
	await alert.present();
}

function report() {
	useModerationStore().openReport({
		type: "user",
		id: targetProfile.value._id,
		label: targetProfile.value.name,
	});
}
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

ion-modal.liquid-user-sheet {
  --border-radius: 2.5rem 2.5rem 0 0;
}

ion-modal.liquid-user-sheet::part(handle) {
  background: var(--ion-color-secondary);
  opacity: 0.3;
  width: 40px;
}
</style>