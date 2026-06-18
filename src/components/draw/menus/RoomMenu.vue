<template>
  <BaseSheetModal
    :is-open="roomMenuOpen"
    :title="roomId ? (isPublicLobby ? publicLobbyName : 'Room Session') : 'Let\'s Draw'"
    :subtitle="!roomId ? 'Share a canvas with others' : undefined"
    @close="onDismiss"
  >
    <!-- ACTIVE SESSION VIEW -->
    <div v-if="roomId" class="space-y-6 animate-fade-in pt-1">

      <!-- Room Code Hub Card -->
      <div class="bg-background border border-default-medium p-5 rounded-[2rem] flex items-center justify-between">
        <div class="flex flex-col">
          <span class="text-sm font-bold opacity-60 uppercase tracking-widest mb-1">
            Room Code
          </span>
          <div class="flex items-center gap-2">
            <h1 class="text-4xl text-secondary font-black tracking-tighter leading-none">
              {{ roomId }}
            </h1>
            <ion-button
              fill="clear"
              size="small"
              class="ion-no-margin h-8 w-8 text-secondary"
              @click="shareUrl(roomIdLink, '', '', 'Link copied!')"
            >
              <ion-icon slot="icon-only" :icon="svg(mdiShareVariant)" class="text-2xl" />
            </ion-button>
          </div>
        </div>
        <div class="p-2 bg-white rounded-2xl ring-1 ring-black/5">
          <qrcode-vue :value="roomIdLink" :size="80" background="white" foreground="#000" />
        </div>
      </div>

      <!-- Action Actions Section -->
      <div class="flex gap-3">
        <button
          @click="openLobbyChat"
          class="flex-1 h-12 bg-cyan-400 text-white rounded-full text-sm font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <ion-icon :icon="chatbubblesOutline" class="text-lg" />
          Chat
        </button>

        <ion-button
          @click="openInvitePopover"
          color="secondary"
          shape="round"
          class="flex-1 h-12 text-sm font-black uppercase tracking-widest"
        >
          <ion-icon slot="start" :icon="svg(mdiAccountPlus)" class="text-lg" />
          Invite
        </ion-button>
      </div>

      <!-- Artist Registry Slider Section -->
      <section class="py-2">
        <h3 class="text-sm font-black opacity-40 uppercase tracking-widest mb-3 px-1">
          Artists <span class="text-secondary opacity-100 ml-1">{{ roomMembers.length }}</span>
        </h3>
        <div class="flex overflow-x-auto gap-5 pb-2 hide-scrollbar snap-x">
          <div
            v-for="member in roomMembers"
            :key="member._id"
            class="flex flex-col items-center gap-2 snap-start min-w-[70px] active:scale-95 transition-transform cursor-pointer py-1"
            @click="openUserActions(member)"
          >
            <div class="relative flex items-center justify-center p-1">
              <UserAvatar
                :user="member"
                :customization="member.customization"
                size="sm"
                static
              />
              <div
                v-if="member._id !== user?._id"
                class="absolute bottom-0.5 right-1 w-3.5 h-3.5 bg-green-400 border-2 border-white rounded-full z-20"
              ></div>
            </div>

            <span
              class="text-[13px] font-bold text-center truncate w-20 leading-none transition-colors"
              :class="member._id === user?._id ? 'text-secondary' : 'text-heading'"
            >
              {{ member._id === user?._id ? 'You' : member.name.split(' ')[0] }}
            </span>
          </div>
        </div>
      </section>

      <!-- Leave Room CTA -->
      <div class="flex justify-center pt-2">
        <ion-button
          @click="leaveRoom"
          fill="clear"
          color="secondary"
          class="text-sm font-black uppercase tracking-widest ion-no-margin"
        >
          Leave Session
        </ion-button>
      </div>
    </div>

    <!-- ROOM GATEWAY / INACTIVE ROOM VIEW -->
    <div v-else class="space-y-6 animate-fade-in pt-1">
      <ion-button
        expand="block"
        color="secondary"
        shape="round"
        class="h-14 text-lg font-black italic"
        @click="createRoom"
      >
        Create New Room
      </ion-button>

      <div class="flex items-center gap-4 opacity-30 px-6">
        <div class="flex-1 h-px bg-black"></div>
        <span class="text-[10px] font-black uppercase tracking-widest">Or Join</span>
        <div class="flex-1 h-px bg-black"></div>
      </div>

      <!-- Enter Code Panel -->
      <div class="bg-background border border-default-light p-6 rounded-[2rem] flex flex-col items-center gap-5">
        <h3 class="text-sm font-black opacity-40 uppercase tracking-widest w-full text-left">
          Enter Room Code
        </h3>

        <div class="flex items-center justify-center gap-3 w-full">
          <div class="flex space-x-2" @paste="handlePaste">
            <input
              v-for="(digit, index) in code"
              :key="index"
              :id="'code-' + index"
              v-model="code[index]"
              type="text"
              inputmode="numeric"
              maxlength="1"
              class="block h-12 w-12 rounded-xl border border-default-medium bg-white text-center text-xl font-black text-secondary focus:border-secondary focus:ring-0 focus:outline-none transition-all"
              @input="focusNext(index)"
              @keydown.delete="focusPrev(index, $event)"
            />
          </div>

          <template v-if="isNative()">
            <ion-button
              color="secondary"
              shape="round"
              class="h-12 w-12 m-0"
              @click="startScanningHelper"
            >
              <ion-icon slot="icon-only" :icon="svg(mdiCamera)" class="text-2xl" />
            </ion-button>
          </template>
        </div>

        <ion-button
          expand="block"
          color="secondary"
          shape="round"
          class="w-full h-12 font-black text-base disabled:opacity-40"
          :disabled="!isCodeComplete"
          @click="joinRoom(codeString)"
        >
          Join Artists
        </ion-button>
      </div>

      <!-- Public Dynamic Feeds -->
      <ActiveLobbies
        v-if="!isUnderAge"
        :lobbies="publicLobbies"
        @join="(id) => handleJoinPublicLobby(id)"
        :loading="publicLobbies.length === 0 && isWatchingPublicLobbies"
      />
    </div>
  </BaseSheetModal>

  <LobbyInvitePopover
    :is-open="invitePopoverOpen"
    :event="inviteEvent"
    @close="invitePopoverOpen = false"
  />
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { computed, nextTick, ref } from "vue";
import { IonButton, IonIcon } from "@ionic/vue";
import { chatbubblesOutline } from "ionicons/icons";
import { mdiAccountPlus, mdiCamera, mdiShareVariant } from "@mdi/js";
import QrcodeVue from "qrcode.vue";

import BaseSheetModal from "@/components/general/BaseSheetModal.vue";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useMenuStore } from "@/store/menu.store";
import { useAuthStore } from "@/store/auth.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useScanner } from "@/service/scanner.service";
import {
	leaveRoom as apiLeaveRoom,
	socketJoinRoom,
} from "@/service/api/socket/drawSyncing.socket";
import { generateRandomCode, isNative, svg } from "@/helper/general.helper";
import { createRoomLink, shareUrl } from "@/helper/share.helper";

import LobbyInvitePopover from "@/components/chat/LobbyInvitePopover.vue";
import ActiveLobbies from "@/components/home/ActiveLobbies.vue";
import { useDrawLoadStore } from "@/draw/store/drawLoad.store";
import { useToast } from "@/service/toast.service";
import { useUserContextSheet } from "@/composables/profile/useUserContextSheet";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";

const drawSyncerStore = useDrawSyncer();
const {
	roomId,
	roomMembers,
	isWatchingPublicLobbies,
	publicLobbies,
	isPublicLobby,
	publicLobbyName,
} = storeToRefs(drawSyncerStore);
const { roomMenuOpen } = storeToRefs(useMenuStore());
const { user, isUnderAge } = storeToRefs(useAuthStore());
const chatWidget = useChatWidgetStore();
const { startScanning } = useScanner();
const { openUserActions } = useUserContextSheet();

const code = ref(["", "", "", ""]);
const codeString = computed(() => code.value.join(""));
const roomIdLink = computed(() => createRoomLink(roomId.value ?? ""));
const isCodeComplete = computed(() =>
	code.value.every((digit) => digit !== ""),
);

const invitePopoverOpen = ref(false);
const inviteEvent = ref<Event | null>(null);

const openInvitePopover = (ev: Event) => {
	inviteEvent.value = ev;
	invitePopoverOpen.value = true;
};

const openLobbyChat = () => {
	chatWidget.openPanel();
	chatWidget.activeTab = "lobby";
	roomMenuOpen.value = false;
};

const leaveRoom = () => {
	apiLeaveRoom();
};

const onDismiss = () => {
	roomMenuOpen.value = false;
	code.value = ["", "", "", ""];
};

function createRoom() {
	socketJoinRoom({ roomId: generateRandomCode(), intent: "create" });
}

async function joinRoom(joinCode: string) {
	if (joinCode == "") return;
	const { exitWithBackgroundSave, hasContent } = useDrawLoadStore();
	if (hasContent()) {
		const { toast } = useToast();
		toast("Saving draft before joining...");
		await exitWithBackgroundSave();
	}
	socketJoinRoom({ roomId: joinCode, intent: "join" });
}

const focusNext = (index: number) => {
	if (index === 3) joinRoom(codeString.value);
	else if (code.value[index] && index < 3) {
		document.getElementById(`code-${index + 1}`)?.focus();
	}
};

const focusPrev = (index: number, event: any) => {
	if (event.key === "Backspace" && !code.value[index] && index > 0) {
		document.getElementById(`code-${index - 1}`)?.focus();
	}
};

const handlePaste = (event: any) => {
	const pasteData = event.clipboardData.getData("text").slice(0, 4).split("");
	if (pasteData.length) {
		pasteData.forEach((char: any, index: number) => {
			if (index < 4) code.value[index] = char;
		});
		nextTick(() => document.getElementById("code-3")?.focus());
	}
};

async function handleJoinPublicLobby(id: string) {
	const lobby = publicLobbies.value.find((l) => l.id === id);
	if (!lobby || lobby.users >= lobby.maxUsers) return;
	joinRoom(id);
	publicLobbyName.value = lobby.name;
	isPublicLobby.value = true;
}

async function startScanningHelper() {
	const scanned = await startScanning();
	if (!scanned) return;
	const url = new URL(scanned);
	const qId = url.searchParams.get("room_id");
	if (qId) joinRoom(qId);
}
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s cubic-bezier(0.1, 0.7, 0.1, 1);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(15px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

input {
  font-family: 'cabin-sketch-regular', sans-serif;
}
</style>