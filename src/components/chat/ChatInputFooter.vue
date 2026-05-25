<template>
  <div class="flex flex-col shrink-0 w-full z-10">

    <div v-if="showRelationshipBanner && partner" class="px-3 pb-2 pt-2 w-full">
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
        @upgrade="() => menuStore.openMenu(Menu.Shop)"
      />
    </div>

    <div class="p-3 bg-white/40 border-t border-secondary/20 backdrop-blur-2xl pb-safe">
      <div class="flex items-center gap-2">
        <button
          @click="handleInviteClick"
          :disabled="!chatStore.canSendMessage(activeTab)"
          class="w-11 h-11 rounded-2xl border border-secondary/30 bg-secondary/10 flex items-center justify-center active:scale-90 transition-all shadow-sm disabled:opacity-30"
        >
          <ion-icon
            :icon="activeTab === 'lobby' ? svg(mdiAccountMultiplePlusOutline) : svg(mdiAccountPlusOutline)"
            class="text-2xl text-secondary"
          />
        </button>

        <div
          class="flex-1 flex items-center gap-1 bg-white/90 border border-secondary/20 rounded-2xl p-1.5 shadow-inner transition-opacity"
          :class="{ 'opacity-60': !chatStore.canSendMessage(activeTab) }"
        >
          <ion-input
            v-model="inputText"
            @keyup.enter="handleSend"
            :disabled="!chatStore.canSendMessage(activeTab)"
            :placeholder="chatStore.chatInputPlaceholder(activeTab)"
            class="cabin-sketch-regular font-bold px-2"
            color="secondary"
          />

          <button
            @mousedown.prevent
            v-if="chatStore.canSendMessage(activeTab)"
            @click="handleSend"
            class="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center active:scale-90 transition-all shadow-md"
          >
            <ion-icon :icon="svg(mdiSend)" class="text-white text-lg ml-0.5" />
          </button>

          <div v-else class="w-10 h-10 flex items-center justify-center opacity-30">
            <ion-icon :icon="svg(mdiClockOutline)" class="text-secondary text-lg" />
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
	IonIcon,
	IonInput,
	useIonRouter,
} from "@ionic/vue";
import {
	mdiAccountMultiplePlusOutline,
	mdiAccountPlusOutline,
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

// Converted to reactive computed properties to drive the banner
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
	const s = currentChat.value.status;
	return ["pending_invite", "temporary", "pending_mate", "expired"].includes(
		s as string,
	);
});

// --- Relationship Action Handlers ---

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

// --- Interaction Handlers ---

const handleInviteClick = (ev: Event) => {
	if (activeTab.value === "lobby") {
		emit("open-invite-popover", ev);
	} else {
		openPrivateInviteSheet();
	}
};

const openPrivateInviteSheet = async () => {
	if (!partner.value) return;

	const buttons = [
		{
			text: "Start drawing together",
			icon: svg(mdiDraw),
			handler: () => {
				if (roomId.value) {
					confirmNewSession(partner.value!._id, partner.value!.name);
				} else {
					startDrawingTogether(partner.value!._id);
				}
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
			{ text: "Cancel", role: "cancel", cssClass: "alert-button-confirm" },
			{
				text: "Confirm",
				cssClass: "alert-button-confirm",
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
	// Removed async
	const text = inputText.value.trim();
	if (!text) return;

	if (activeTab.value === "lobby") {
		sendLobbyMessage(text);
	} else {
		if (partner.value?._id) {
			// Removed await so it doesn't block the thread
			chatStore
				.sendMessage(partner.value._id, text, activeTab.value)
				.catch(console.error);
		}
	}

	inputText.value = "";

	nextTick(() => {
		emit("sent");
	});
};
</script>