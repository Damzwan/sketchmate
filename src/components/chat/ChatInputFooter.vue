<template>
  <!-- No `shrink-0` on the root, deliberately. The banner can be tall (the
       "Why invites?" panel especially), and with the keyboard open the column
       above has ~300px less to give. When every child refused to shrink, the
       fixed-height items outgrew the column, the message list's flex-1
       collapsed to 0, and the parent's overflow-hidden clipped the bottom of
       this footer — the input bar — clean off the screen. Now the footer can
       shrink; the banner absorbs it (below) and the input bar can't. -->
  <div class="flex flex-col w-full z-10 relative min-h-0">
    <!-- The banner is the part that yields. It scrolls inside its own box
         rather than pushing the input bar out of the viewport, and the cap is
         in dvh so it tracks the real viewport on web too. -->
    <div
      v-if="showRelationshipBanner && partner"
      class="bg-background px-3 pt-2 pb-1 w-full min-h-0 overflow-y-auto max-h-[40dvh] hide-scrollbar"
    >
      <ChatRelationshipBanner
        :chat="currentChat"
        :partner="partner"
        :currentUserId="authStore.user?._id"
        @accept-invite="chatStore.respondToRequest(currentChat._id, 'accept')"
        @decline-invite="chatStore.respondToRequest(currentChat._id, 'decline')"
        @request="handleMateRequest"
        @accept="handleMateAccept"
        @decline="handleMateDecline"
        @cancel-mate="chatStore.handleCancelMateRequest(currentChat._id)"
        @upgrade="() => useSubscriptionStore().openPaywall()"
      />
    </div>

    <!-- `pb-safe` was a no-op — this project defines `bot-pad-safe`, not
         `pb-safe` — so the input bar sat directly on the gesture/home bar.
         Stated as one calc so the inset ADDS to the bar's own breathing room
         instead of replacing it (the two padding utilities would have fought). -->
    <!-- shrink-0 lives HERE now, not on the root: the input bar is the one part
         of this footer that must never be compressed or clipped away. -->
    <div class="px-4 pt-3 chat-footer-pad bg-background border-t border-primary/10 shrink-0">
      <div class="flex items-center gap-1">

        <ion-button
          fill="clear"
          shape="round"
          color="secondary"
          @click="handleInviteClick"
          :disabled="!chatStore.canSendMessage(activeTab)"
          :title="activeTab === 'lobby' ? 'Invite to Lobby' : 'Draw Together'"
        >
          <ion-icon
            slot="icon-only"
            class="text-2xl"
            :icon="activeTab === 'lobby' ? svg(mdiAccountMultiplePlusOutline) : svg(mdiDraw)"
          />
        </ion-button>

        <div
          class="flex-1 flex items-center gap-1.5 bg-white border border-primary/20 rounded-2xl pl-2 pr-1 py-1 shadow-sm transition-opacity"
          :class="{ 'opacity-50': !chatStore.canSendMessage(activeTab) }"
        >
          <ion-input
            v-model="inputText"
            @keyup.enter="handleSend"
            :disabled="!chatStore.canSendMessage(activeTab)"
            :placeholder="chatStore.chatInputPlaceholder(activeTab)"
            class="font-bold px-2 text-[15px] min-h-[36px]"
            color="secondary"
          />

          <ion-button
            v-if="chatStore.canSendMessage(activeTab)"
            fill="clear"
            shape="round"
            color="secondary"
            @mousedown.prevent
            @click="handleSend"
            :disabled="!inputText.trim()"
          >
            <ion-icon slot="icon-only" :icon="svg(mdiSend)" class="text-xl ml-0.5" />
          </ion-button>

          <div v-else class="w-9 h-9 flex items-center justify-center opacity-30 text-secondary shrink-0">
            <ion-icon :icon="svg(mdiClockOutline)" class="text-base" />
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { storeToRefs } from "pinia";
import {
	actionSheetController,
	alertController,
	IonButton,
	IonIcon,
	IonInput,
	useIonRouter,
} from "@ionic/vue";
import {
	mdiAccountMultiplePlusOutline,
	mdiClockOutline,
	mdiDraw,
	mdiLoginVariant,
	mdiSend,
} from "@mdi/js";
import { generateRandomCode, svg } from "@/helper/general.helper";

import ChatRelationshipBanner from "./ChatRelationshipBanner.vue";

import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useAuthStore } from "@/store/auth.store";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useFriendStore } from "@/store/friend.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/draw/types/draw.types";
import {
	acceptMatership,
	declineMatership,
	requestMatership,
} from "@/service/api/relationship.api";
import {
	inviteFriendToRoom,
	leaveRoom,
	sendLobbyMessage,
	socketJoinRoom,
} from "@/service/api/socket/drawSyncing.socket";
import { PopulatedConversation } from "@/types/server.types";
import { useSubscriptionStore } from "@/store/subscription.store";

const emit = defineEmits(["sent", "open-invite-popover"]);

const authStore = useAuthStore();
const chatWidget = useChatWidgetStore();
const chatStore = useChatStore();
const friendStore = useFriendStore();
const drawSyncer = useDrawSyncer();
const menuStore = useMenuStore();
const router = useIonRouter();

const { activeTab } = storeToRefs(chatWidget);
const { roomId } = storeToRefs(drawSyncer);
const inputText = ref("");

const currentChat = computed(() => {
	if (activeTab.value === "lobby") return null;
	return [...chatStore.activeChats, ...friendStore.pendingRequests].find(
		(c) => c._id === activeTab.value,
	);
});

const partner = computed(() => {
	if (activeTab.value === "lobby") return null;
	if (currentChat.value) {
		return currentChat.value.participants.find(
			(p: any) => p._id !== authStore.user?._id,
		);
	}
	return friendStore.resolvePartnerInfo(activeTab.value);
});

const showRelationshipBanner = computed(() => {
	if (!currentChat.value) return false;
	return ["pending_invite", "temporary", "pending_mate", "expired"].includes(
		currentChat.value.status as string,
	);
});

async function handleMateRequest() {
	if (!currentChat.value?.relationship_id) return;
	try {
		await requestMatership(currentChat.value._id);
		const idx = chatStore.activeChats.findIndex(
			(c) => c._id === currentChat.value!._id,
		);
		if (idx !== -1)
			chatStore.activeChats[idx] = {
				...chatStore.activeChats[idx],
				status: "pending_mate",
				initiator_id: authStore.user?._id?.toString(),
			};
	} catch (e) {
		console.error(e);
	}
}

async function handleMateAccept() {
	if (!currentChat.value?.relationship_id) return;
	try {
		const { conversation } = (await acceptMatership(
			currentChat.value.relationship_id,
		)) as { conversation: PopulatedConversation };
		chatStore.handleMateMatched({ conversation });
	} catch (e) {
		console.error(e);
	}
}

async function handleMateDecline() {
	if (!currentChat.value?.relationship_id) return;
	try {
		const { status } = (await declineMatership(
			currentChat.value.relationship_id,
		)) as any;
		const idx = chatStore.activeChats.findIndex(
			(c) => c._id === currentChat.value!._id,
		);
		if (idx !== -1)
			chatStore.activeChats[idx] = {
				...chatStore.activeChats[idx],
				status,
				initiator_id: undefined,
			};
	} catch (e) {
		console.error(e);
	}
}

const handleInviteClick = (ev: Event) => {
	if (activeTab.value === "lobby") emit("open-invite-popover", ev);
	else openPrivateInviteSheet();
};

const openPrivateInviteSheet = async () => {
	if (!partner.value) return;
	const buttons = [
		{
			text: "Start drawing together",
			icon: svg(mdiDraw),
			handler: () => {
				if (roomId.value)
					confirmNewSession(partner.value!._id, partner.value!.name);
				else startDrawingTogether(partner.value!._id);
			},
		},
	];

	if (roomId.value) {
		buttons.unshift({
			text: "Invite to current Lobby",
			icon: svg(mdiLoginVariant),
			handler: async () => {
				inviteFriendToRoom(partner.value!._id, roomId.value!);
			},
		});
	}

	const actionSheet = await actionSheetController.create({
		header: `Session with ${partner.value.name}`,
		cssClass: "liquid-action-sheet",
		buttons,
	});
	await actionSheet.present();
};

const confirmNewSession = async (friendId: string, name: string) => {
	const alert = await alertController.create({
		header: "Start New Session?",
		subHeader: "This will leave your current lobby.",
		message: `You are about to start a private drawing session with ${name}.`,
		cssClass: "liquid-alert",
		buttons: [
			{ text: "Cancel", role: "cancel" },
			{
				text: "Confirm",
				handler: () => {
					leaveRoom();
					setTimeout(() => startDrawingTogether(friendId), 100);
				},
			},
		],
	});
	await alert.present();
};

const startDrawingTogether = async (friendId: string) => {
	const newRoomId = generateRandomCode();
	chatWidget.closePanel();
	router.push("/draw");
	setTimeout(() => {
		socketJoinRoom({ roomId: newRoomId, intent: "create" });
		inviteFriendToRoom(friendId, newRoomId);
	}, 400);
};

const handleSend = () => {
	const text = inputText.value.trim();
	if (!text) return;
	if (activeTab.value === "lobby") {
		sendLobbyMessage(text);
	} else if (partner.value?._id) {
		chatStore
			.sendMessage(partner.value._id, text, activeTab.value)
			.catch(console.error);
	}
	inputText.value = "";
	nextTick(() => {
		emit("sent");
	});
};
</script>

<style scoped>
.chat-footer-pad {
  padding-bottom: calc(var(--ion-safe-area-bottom, 0px) + 0.75rem);
}

.hide-scrollbar::-webkit-scrollbar { display: none !important; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>