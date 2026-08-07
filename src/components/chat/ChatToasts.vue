<!-- components/ChatToasts.vue -->
<template>
  <div v-if="!isExpanded && !isFullscreen && !chatToastsSilenced"
       class="fixed top-safe right-4 z-[10] flex flex-col gap-2 w-64 pointer-events-none transition-all duration-300"
       :class="toastMarginTop">
    <TransitionGroup name="chat-toast">
      <ChatToastItem
        v-for="group in notifications"
        :key="group.tabId"
        :toast="group"
        @click.stop="openFromNotification(group.tabId)"
        class="pointer-events-auto cursor-pointer"
      />
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, defineAsyncComponent, watch } from "vue";
import { useRoute } from "vue-router";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useAuthStore } from "@/store/auth.store";
import { useChatStore } from "@/store/chat.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useFriendStore } from "@/store/friend.store";
import { useOverlayRuntimeStore } from "@/store/overlayRuntime.store";
import { FRONTEND_ROUTES } from "@/types/router.types";

// The listener/controller stays tiny at login. Cosmetic worlds/effects load
// only when the first visible toast actually needs rendering.
const ChatToastItem = defineAsyncComponent(
	() => import("@/components/chat/ChatToastItem.vue"),
);

const chatWidget = useChatWidgetStore();
const chatStore = useChatStore();
const authStore = useAuthStore();
const drawSyncer = useDrawSyncer();
const friendStore = useFriendStore();

const { isExpanded, activeTab } = storeToRefs(chatWidget);
const { notifications } = storeToRefs(chatStore);
const { isFullscreen, chatToastsSilenced } = storeToRefs(
	useOverlayRuntimeStore(),
);
const { user } = storeToRefs(authStore);
const { lobbyChatMessages, invitations } = storeToRefs(drawSyncer);
const { isLoadingCanvas } = storeToRefs(drawSyncer);

let isInitialLobbyLoad = true;

/**
 * WATCHER: Lobby Messages
 */
watch(
	() => lobbyChatMessages.value.length,
	(len, prevLen = 0) => {
		if (len === 0 || len <= prevLen) return;

		const messages = lobbyChatMessages.value;
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
				subtitle: isMe ? user.value?.name : latest.member?.name || "Lobby",
				text,
				img: latest.member?.img || (isMe ? user.value?.img : ""),
				senderId: latest.member?._id || (isMe ? user.value?._id : undefined),
				isTrial: false,
				isRequest: false,
				isJoin: latest.type === "join",
				customization:
					latest.member?.customization ||
					(isMe ? user.value?.customization : null),
			} as any);

			isInitialLobbyLoad = false;
			return;
		}

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
			senderId: latest.member?._id,
			isTrial: false,
			isRequest: false,
			customization: latest.member?.customization,
		});
	},
);

/**
 * WATCHER: Drawing Invitations
 */
watch(
	() => invitations.value.length,
	(newLen, oldLen) => {
		if (newLen <= (oldLen || 0)) return;
		const latest = invitations.value[invitations.value.length - 1];
		if (!latest) return;

		chatStore.addNotification({
			tabId: latest.friend._id,
			subtitle: "Drawing Invite",
			text: `${latest.friend.name} wants to sketch!`,
			img: latest.friend.img,
			senderId: latest.friend._id,
			isTrial: false,
			isRequest: true,
			customization: latest.friend.customization,
		});
	},
);

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
</style>
