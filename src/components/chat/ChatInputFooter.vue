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
      class="chat-widget-chrome px-3 pt-2 pb-1 w-full min-h-0 overflow-y-auto max-h-[40dvh] hide-scrollbar"
    >
      <!-- All the relationship mutations moved into useRelationshipActions, so
           the banner runs them itself instead of emitting six events for this
           component to re-implement. The header strip and the info modal call
           the same composable, which is the only way three surfaces can stay
           in agreement about local optimistic state. -->
      <ChatRelationshipBanner
        :chat="currentChat"
        :partner="partner"
        :currentUserId="authStore.user?._id"
        @open-info="chatWidget.openRelationshipInfo()"
      />
    </div>

    <!-- `pb-safe` was a no-op — this project defines `bot-pad-safe`, not
         `pb-safe` — so the input bar sat directly on the gesture/home bar.
         Stated as one calc so the inset ADDS to the bar's own breathing room
         instead of replacing it (the two padding utilities would have fought). -->
    <!-- shrink-0 lives HERE now, not on the root: the input bar is the one part
         of this footer that must never be compressed or clipped away. -->
    <!-- Child account whose parent hasn't switched chat on: the composer is
         replaced outright rather than left to fail on send. -->
    <div
      v-if="chatLocked"
      class="px-3 pt-2 chat-footer-pad chat-widget-chrome shrink-0"
    >
      <button
        type="button"
        class="w-full bg-amber-100/90 border border-amber-300/60 rounded-2xl px-4 py-3 flex items-center gap-3 text-left active:scale-[0.98] transition-transform"
        @click="openParentalControls"
      >
        <ion-icon :icon="svg(mdiShieldLockOutline)" class="text-2xl text-amber-600 shrink-0" />
        <span class="text-amber-900 leading-tight">
          <span class="block text-[13px] font-black">Chat is switched off</span>
          <span class="block text-[12px] opacity-90">A parent or guardian can turn it on — tap here.</span>
        </span>
      </button>
    </div>

    <div v-else class="px-2 pt-1.5 chat-footer-pad chat-widget-chrome shrink-0">
      <div class="flex items-center gap-0.5">

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
            class="chat-composer-input font-bold px-2 text-[15px]"
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
	mdiShieldLockOutline,
} from "@mdi/js";
import { generateRandomCode, svg } from "@/helper/general.helper";

import ChatRelationshipBanner from "./ChatRelationshipBanner.vue";
import {
	needsDecision,
	resolveRelationship,
} from "@/config/relationship.config";

import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useAuthStore } from "@/store/auth.store";
import { useParentalStore } from "@/store/parental.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { useFriendStore } from "@/store/friend.store";
import { useMenuStore } from "@/store/menu.store";
import { Menu } from "@/types/menu.types";
import {
	inviteFriendToRoom,
	leaveRoom,
	sendLobbyMessage,
	socketJoinRoom,
} from "@/service/api/socket/drawSyncing.socket";

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

// Same rule the banner applies to itself (relationship.config's needsDecision),
// asked here too — NOT a second drifting copy of the status list, but the same
// helper. It has to be asked here because this wrapper carries its own padding:
// with only `!!currentChat` the wrapper rendered for every DM, and on the
// overwhelmingly common "no decision pending" chat the banner inside it drew
// nothing — leaving a permanent empty band of padding between the thread and
// the input bar with no visible element to explain it.
const showRelationshipBanner = computed(() => {
	if (!currentChat.value) return false;
	const chat = currentChat.value as any;
	return needsDecision(
		resolveRelationship({
			status: chat.status,
			initiatorId: chat.initiator_id,
			currentUserId: authStore.user?._id,
			trialExpiresAt: chat.trial_expires_at,
		}).kind,
	);
});

const handleInviteClick = async (ev: Event) => {
	// A shared room is freeform media exchange, gated separately from chat.
	if (!(await parental.ensureCanExchange("rooms"))) return;
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

const parental = useParentalStore();

const chatLocked = computed(
	() => parental.isChildAccount && !parental.isAllowed("mate_chat"),
);

function openParentalControls() {
	void parental.openControls();
}

const handleSend = async () => {
	const text = inputText.value.trim();
	if (!text) return;
	// Families policy: adult consent + an acknowledged safety reminder gate the
	// first outgoing message on a child account, and the reminder returns every
	// 30 days after that.
	if (!(await useParentalStore().ensureCanExchange("mate_chat"))) return;
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
  padding-bottom: calc(var(--ion-safe-area-bottom, 0px) + 0.375rem);
}
.chat-widget-chrome {
  background: var(--chat-widget-scrim, var(--ion-color-background));
  border-color: var(--chat-widget-border, rgba(0,0,0,0.08));
}

/*
 * Emoji glyphs come from the OS colour-emoji font, whose ascent/descent are
 * taller than the Latin face's. With an auto line box the native input grew a
 * few px the moment an emoji was typed and shrank again when it was deleted —
 * the composer visibly jumping, and (because the footer sits in a flex column
 * over a keyboard-inset panel) the whole thread re-laying out under it. Pinning
 * the line box and the control's height makes the row a fixed 36px regardless
 * of which font renders the glyphs; the emoji simply overflows its line box,
 * which is invisible inside a single-line field.
 */
.chat-composer-input {
  /* Do not inherit a profile/theme/font-effect color from the customized chat
     surface. Ionic otherwise decides the native input color through its host
     context, which can produce pale or transparent typed text. */
  --color: #18181b;
  --placeholder-color: rgba(24, 24, 27, 0.48);
  --placeholder-opacity: 1;
  --highlight-color-focused: var(--ion-color-secondary);
  --padding-top: 0;
  --padding-bottom: 0;
  min-height: 36px;
}

.chat-composer-input :deep(input) {
  color: #18181b !important;
  -webkit-text-fill-color: #18181b;
  caret-color: var(--ion-color-secondary);
  height: 36px;
  line-height: 36px;
}

.hide-scrollbar::-webkit-scrollbar { display: none !important; }
.hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>
