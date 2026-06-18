<template>
  <div
    class="flex items-center p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md shadow-lg space-x-1">

    <ToolButton
      :icon="svg(mdiFullscreen)"
      @click="() => {
      toast('Fullscreen: Messages Silenced')
      $emit('toggle-fullscreen')
      }"
      custom-class="hover:bg-primary/20"
    />
    

    <ToolButton
      :icon="bulbOutline"
      @click="openMenu(Menu.FeedbackMenu)"
      custom-class="hover:bg-primary/20"
    />

    <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

    <ToolButton
      :disabled="!isLobby"
      :icon="megaphoneOutline"
      @click="openUserReportMenu"
      custom-class="hover:bg-primary/20"
    />

    <ToolButton
      :disabled="!isLoggedIn"
      :icon="chatbubblesOutline"
      @click="openPanel"
      :badge="totalUnreadCount"
    >
      <!-- Just a pulse dot in the corner to show "people are online" -->
      <div
        class="absolute top-1 left-1 w-2 h-2 bg-green-500 rounded-full border border-white shadow-[0_0_5px_rgba(34,197,94,0.6)]"></div>
    </ToolButton>


    <ToolButton
      :icon="svg(mdiAccountGroupOutline)"
      :custom-class="roomMembers.length > 0
        ? 'border-secondary/60 bg-secondary/5'
        : 'hover:bg-primary/20 border-transparent'"
      :icon-class="roomMembers.length > 0 ? 'text-secondary' : 'text-black'"
      :badge="roomMembers.length"
      @click="openMenu(Menu.DrawRoomMenu, $event)"
    />

    <ToolButton
      id="send"
      :disabled="!isLoggedIn"
      :icon="svg(mdiSend)"
      custom-class="bg-secondary shadow-md border-secondary ml-1"
      icon-class="text-white"
      @click="startSendFlow"
    />

  </div>
</template>

<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useMenuStore } from "@/store/menu.store";
import { useDrawUIStore } from "@/draw/store/drawUI.store";
import ToolButton from "./ToolButton.vue";
import {
	mdiAccountGroupOutline,
	mdiFullscreen,
	mdiMapOutline,
	mdiSend,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { Menu } from "@/draw/types/draw.types";
import SendHub from "../send/SendHub.vue";
import { useAuthStore } from "@/store/auth.store";
import {
	chatbubblesOutline,
	megaphoneOutline,
	bulbOutline,
} from "ionicons/icons";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useToast } from "@/service/toast.service";
import { modalController } from "@ionic/vue";
import ReportUserMenu from "@/components/moderation/ReportUserMenu.vue";

defineEmits(["toggle-fullscreen"]);

const { roomMembers, isLobby } = storeToRefs(useDrawSyncer());
const { openMenu } = useMenuStore();
const { isLoggedIn, user } = storeToRefs(useAuthStore());
const { openPanel } = useChatWidgetStore();

const { totalUnreadCount } = storeToRefs(useChatStore());
const { toast } = useToast();

const startSendFlow = async (e: Event) => {
	const nav = (e.target as HTMLElement).closest("ion-nav");
	nav?.push(SendHub);
};

async function openUserReportMenu() {
	const modal = await modalController.create({
		component: ReportUserMenu,
		componentProps: {
			roomMembers: roomMembers.value.filter((u) => u._id !== user.value!._id),
		},
		cssClass: "sketch-modal",
	});
	await modal.present();
}
</script>