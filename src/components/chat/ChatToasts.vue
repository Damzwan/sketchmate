<!-- components/ChatToasts.vue -->
<template>
  <div v-if="!isExpanded && !isFullscreen && !chatToastsSilenced"
       class="fixed top-safe right-4 z-[10] flex flex-col gap-2 w-64 pointer-events-none transition-all duration-300"
       :class="toastMarginTop">
    <TransitionGroup name="chat-toast">
      <div
        v-for="group in notifications"
        :key="group.tabId"
        @click.stop="openFromNotification(group.tabId)"
        class="relative flex items-start p-2.5 rounded-xl border backdrop-blur-xl shadow-2xl pointer-events-auto cursor-pointer overflow-hidden transition-all active:scale-[0.98] bg-zinc-900/80 border-white/10"
      >
        <!-- Dynamic Side Border Color -->
        <div class="absolute left-0 top-0 bottom-0 w-1"
             :class="getBorderColor(group)"></div>

        <div class="relative shrink-0 ml-1">
          <img :src="group.img" class="w-8 h-8 rounded-lg object-cover border border-white/10 shadow-md" />

          <!-- Mini Icon Overlay -->
          <div v-if="group.isTrial || group.isMateProposal"
               class="absolute -bottom-1 -right-1 rounded-full p-0.5 border border-zinc-900"
               :class="group.isMateProposal ? 'bg-secondary' : 'bg-secondary'">
            <ion-icon
              :icon="svg(group.isMateProposal ? mdiHeart : mdiClockOutline)"
              class="text-[8px] text-white"
            />
          </div>
        </div>

        <div class="flex-1 min-w-0 ml-2.5 flex flex-col">
          <div class="flex items-center justify-between mb-0.5">
            <span class="text-[9px] font-black text-white/50 uppercase tracking-widest truncate">
              {{ group.subtitle }}<span v-if="group.title" class="text-white/30"> · {{ group.title }}</span>
            </span>
            <!-- Contextual Badges -->
            <span v-if="group.isRequest || group.isMateProposal"
                  class="text-[7px] font-black bg-secondary px-1.5 py-0.5 rounded text-white uppercase animate-pulse">
              {{ group.isMateProposal ? 'Mate Proposal' : 'New Request' }}
            </span>
          </div>
          <div class="flex flex-col">
            <TransitionGroup name="line-slide">
              <p v-for="line in group.lines" :key="line.id"
                 class="text-[13px] text-white/90 leading-tight cabin-sketch-regular font-bold tracking-wide break-words">
                {{ line.text }}
              </p>
            </TransitionGroup>
          </div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { storeToRefs } from "pinia";
import { IonIcon } from "@ionic/vue";
import { mdiClockOutline, mdiHeart } from "@mdi/js";
import { svg } from "@/helper/general.helper";

import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useAuthStore } from "@/store/auth.store";
import { useDrawUIStore } from "@/draw/store/drawUI.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useFriendStore } from "@/store/friend.store";
import { FRONTEND_ROUTES } from "@/types/router.types";
import { useRoute } from "vue-router"; // <-- Added FriendStore

const chatWidget = useChatWidgetStore();
const chatStore = useChatStore();
const authStore = useAuthStore();
const drawUI = useDrawUIStore();
const drawSyncer = useDrawSyncer();
const friendStore = useFriendStore(); // <-- Initialized FriendStore

const { isExpanded, activeTab } = storeToRefs(chatWidget);
const { notifications } = storeToRefs(chatStore);
const { isFullscreen, chatToastsSilenced } = storeToRefs(drawUI);
const { user } = storeToRefs(authStore);
const { lobbyChatMessages, invitations } = storeToRefs(drawSyncer);

const { isLoadingCanvas } = storeToRefs(drawSyncer);

let isInitialLobbyLoad = true;

/**
 * WATCHER: Lobby Messages
 */
watch(
	lobbyChatMessages,
	(messages) => {
		if (messages.length === 0) return;

		const latest = messages[messages.length - 1] as any;
		const senderId = latest.member?._id || "system";

		if (latest.type === "join" || latest.type === "leave") {
			const isMe = latest.member?._id === user.value?._id;

			const text =
				latest.type === "join"
					? isMe
						? "You hopped into the room!"
						: `${latest.member?.name} hopped in!`
					: "left the room.";

			if (isInitialLobbyLoad && latest.type !== "join") {
				isInitialLobbyLoad = false;
				return;
			}

			chatStore.addNotification({
				tabId: `lobby-${senderId}-${latest.type}`,
				subtitle: isMe ? "System" : latest.member?.name || "Lobby",
				text,
				img: latest.member?.img || "",
				isTrial: false,
				isRequest: false,
			});

			isInitialLobbyLoad = false;
			return;
		}

		// 2. HANDLE REGULAR MESSAGES
		if (isInitialLobbyLoad) {
			isInitialLobbyLoad = false;
			return;
		}

		if (activeTab.value === "lobby" && isExpanded.value) return;
		if (latest.member?._id === user.value?._id) return;

		chatStore.addNotification({
			tabId: `lobby-${senderId}`,
			subtitle: latest.member?.name || "Lobby",
			text: latest.content || latest.message,
			img: latest.member?.img || "",
			isTrial: false,
			isRequest: false,
		});
	},
	{ deep: true },
);

/**
 * WATCHER: Drawing Invitations
 */
watch(
	invitations,
	(newInvites, oldInvites) => {
		if (newInvites.length <= (oldInvites?.length || 0)) return;
		const latest = newInvites[newInvites.length - 1];
		if (!latest) return;

		chatStore.addNotification({
			// Uses a User ID!
			tabId: latest.friend._id,
			subtitle: "Drawing Invite",
			text: `${latest.friend.name} wants to sketch!`,
			img: latest.friend.img,
			isTrial: false,
			isRequest: true,
		});
	},
	{ deep: true },
);

const getBorderColor = (group: any) => {
	if (group.tabId.startsWith("lobby")) return "bg-cyan-400";
	if (group.isMateProposal) return "bg-secondary animate-pulse";
	if (group.isRequest) return "bg-secondary";
	if (group.isTrial) return "bg-amber-400";
	return "bg-secondary";
};

const openFromNotification = (tabId: string) => {
	chatStore.removeNotification(tabId);
	chatWidget.openPanel();

	if (tabId.startsWith("lobby")) {
		chatWidget.activeTab = "lobby";
		return;
	}

	const isExistingChat = [
		...chatStore.activeChats,
		...friendStore.pendingRequests,
	].some((c) => c._id === tabId);

	if (isExistingChat) {
		chatWidget.openPrivateChat(tabId);
	} else {
		chatWidget.openChatWithUser(tabId);
	}
};

const route = useRoute();
const toastMarginTop = computed(() => {
	if (route.path === `/${FRONTEND_ROUTES.draw}`) {
		return isLoadingCanvas.value ? "mt-32" : "mt-20";
	} else {
		return "mt-14";
	}
});
</script>

<style scoped>
.chat-toast-enter-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.chat-toast-leave-active {
  transition: all 0.6s ease-in;
  position: absolute;
  width: 100%;
}
.chat-toast-move {
  transition: transform 0.4s ease;
}
.chat-toast-enter-from {
  opacity: 0;
  transform: translateX(60px) scale(0.9);
}
.chat-toast-leave-to {
  opacity: 0;
  transform: translateX(40px);
  filter: blur(8px);
}
.line-slide-enter-active {
  transition: all 0.3s ease-out;
}
.line-slide-enter-from {
  opacity: 0;
  transform: translateY(5px);
}
.cabin-sketch-regular {
  font-family: 'cabin-sketch-regular', sans-serif;
}
</style>