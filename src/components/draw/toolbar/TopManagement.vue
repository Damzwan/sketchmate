<template>
  <div
    class="flex items-center p-1 rounded-2xl border border-primary/60 bg-primary/40 backdrop-blur-md shadow-lg space-x-1">

    <!-- Autosave status button. Leftmost so the right-anchored pill grows left
         and never shoves the action buttons. Tap = status + manual save. -->
    <Transition name="save-pop">
      <ToolButton v-if="showSave" id="save-status" :icon="svg(saveIcon)" :icon-class="saveIconClass"
        @click="openSaveInfo" custom-class="hover:bg-primary/20 cursor-pointer" />
    </Transition>

    <!-- Overflow: secondary, labeled actions live in a proper menu. -->
    <ToolButton id="mgmt-more" :icon="svg(mdiDotsHorizontal)" @click="openMore"
      custom-class="hover:bg-primary/20 cursor-pointer" />

    <div class="w-[2px] h-6 bg-primary-shade mx-1 rounded-full"></div>

    <!-- Combined chat button — chat icon + unread badge AND online-friends
         count in ONE pill, like TopBar. -->
    <button :disabled="!isLoggedIn" @click="openPanel"
      class="relative flex items-center gap-1.5 pl-2 pr-2.5 h-10 rounded-xl transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
      :class="!isLoggedIn ? '' : 'hover:bg-primary/20 cursor-pointer'">
      <div class="relative flex items-center justify-center">
        <ion-icon :icon="chatbubblesOutline" class="w-6 h-6 text-black" />
        <span v-if="totalUnreadCount > 0"
          class="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-secondary text-white text-[10px] font-black flex items-center justify-center leading-none border border-primary/40">
          {{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}
        </span>
      </div>
      <div class="flex items-center gap-0.5">
        <ion-icon :icon="peopleOutline" class="w-[18px] h-[18px] text-black" />
        <span class="cabin-sketch-regular text-sm font-bold text-black leading-none">
          {{ onlineFriends.length > 99 ? '99+' : onlineFriends.length }}
        </span>
      </div>
    </button>


    <ToolButton :icon="svg(mdiAccountGroupOutline)" :custom-class="roomMembers.length > 0
      ? 'border-secondary/60 bg-secondary/5 cursor-pointer hover:bg-secondary/10'
      : 'hover:bg-primary/20 border-transparent cursor-pointer'"
      :icon-class="roomMembers.length > 0 ? 'text-secondary' : 'text-black'" :badge="roomMembers.length"
      @click="openMenu(Menu.DrawRoomMenu, $event)" />

    <ToolButton id="send" :disabled="!isLoggedIn" :icon="svg(mdiSend)"
      :custom-class="!isLoggedIn ? 'cursor-not-allowed' : 'bg-secondary hover:bg-secondary/90 shadow-md border-secondary ml-1 cursor-pointer'"
      icon-class="text-white" @click="startSendFlow" />

    <!-- Overflow menu — labeled rows, all options always present. Report stays
         visible but disabled outside a lobby so nothing pops in/out on join. -->
    <ion-popover
      class="mgmt-more-popover"
      :is-open="moreOpen"
      :event="moreEvent"
      side="bottom"
      alignment="end"
      :show-backdrop="false"
      @didDismiss="moreOpen = false"
    >
      <ion-content>
        <ion-list lines="none" class="divide-y divide-primary p-0">
          <ion-item color="tertiary" :button="true" :detail="false" @click="runFromMore(onFullscreen)">
            <ion-icon :icon="svg(mdiFullscreen)" />
            <p class="pl-2 text-base">Fullscreen</p>
          </ion-item>

          <ion-item color="tertiary" :button="true" :detail="false"
            @click="runFromMore(() => openMenu(Menu.FeedbackMenu))">
            <ion-icon :icon="bulbOutline" />
            <p class="pl-2 text-base">Feedback</p>
          </ion-item>

          <ion-item color="tertiary" :button="true" :detail="false" :disabled="!isLobby"
            @click="runFromMore(openUserReportMenu)">
            <ion-icon :icon="megaphoneOutline" />
            <p class="pl-2 text-base">Report User</p>
            <p v-if="!isLobby" class="pl-2 text-sm">lobby only</p>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-popover>

    <!-- Save status + manual save -->
    <ion-popover
      class="mgmt-more-popover"
      :is-open="saveInfoOpen"
      :event="saveInfoEvent"
      side="bottom"
      alignment="start"
      :show-backdrop="false"
      @didDismiss="saveInfoOpen = false"
    >
      <ion-content>
        <div class="p-3 w-[230px] bg-tertiary">
          <div class="flex items-center gap-2">
            <ion-icon :icon="svg(saveIcon)" :class="saveIconClass" class="w-5 h-5" />
            <span class="text-lg font-black text-heading">{{ saveStatusText }}</span>
          </div>
          <p class=" text-black/80 mt-1 mb-3 cabin-sketch-regular">
            Your drawing autosaves to this device every {{ AUTOSAVE_SECONDS }}s.
          </p>
          <ion-button  @click="onSaveNow" shape="round" color="secondary"
                       :disabled="!isDirty || isSaving || cooling">
            {{ isSaving ? 'Saving…' : !isDirty ? 'All saved' : 'Save now' }}
          </ion-button>
        </div>
      </ion-content>
    </ion-popover>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useDrawSyncer } from "@/draw/store/drawSyncing.store";
import { useMenuStore } from "@/store/menu.store";
import ToolButton from "./ToolButton.vue";
import {
	mdiAccountGroupOutline,
	mdiCloudCheckOutline,
	mdiCloudSyncOutline,
	mdiContentSaveEditOutline,
	mdiDotsHorizontal,
	mdiFullscreen,
	mdiSend,
} from "@mdi/js";
import { svg } from "@/helper/general.helper";
import { Menu } from "@/draw/types/draw.types";
import SendHub from "../send/SendHub.vue";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import {
	bulbOutline,
	chatbubblesOutline,
	megaphoneOutline,
	peopleOutline,
} from "ionicons/icons";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useChatStore } from "@/store/chat.store";
import { useToast } from "@/service/toast.service";
import {
	IonContent,
	IonIcon,
	IonItem,
	IonList,
	IonPopover,
	modalController,
} from "@ionic/vue";
import { useDrawLoadStore } from "@/draw/store/drawLoad.store";
import ReportUserMenu from "@/components/moderation/ReportUserMenu.vue";

const emit = defineEmits(["toggle-fullscreen"]);

const { roomMembers, isLobby } = storeToRefs(useDrawSyncer());
const { onlineFriends } = storeToRefs(useFriendStore());
const { openMenu } = useMenuStore();
const { isLoggedIn, user } = storeToRefs(useAuthStore());
const { openPanel } = useChatWidgetStore();
const { isSaving, isDirty, sessionHasContent } = storeToRefs(
	useDrawLoadStore(),
);
const { saveNow } = useDrawLoadStore();

const { totalUnreadCount } = storeToRefs(useChatStore());
const { toast } = useToast();

const AUTOSAVE_SECONDS = 20;

// Autosave only runs outside a lobby, so only reassure there.
const showSave = computed(() => !isLobby.value && sessionHasContent.value);

// Accurate three-state status — "saved" only when truly persisted (not dirty).
const saveState = computed<"saving" | "dirty" | "saved">(() =>
	isSaving.value ? "saving" : isDirty.value ? "dirty" : "saved",
);
const saveIcon = computed(
	() =>
		({
			saving: mdiCloudSyncOutline,
			dirty: mdiContentSaveEditOutline,
			saved: mdiCloudCheckOutline,
		})[saveState.value],
);
const saveIconClass = computed(
	() =>
		({
			saving: "text-black/80",
			dirty: "text-amber-500",
			saved: "text-secondary",
		})[saveState.value],
);
const saveStatusText = computed(
	() =>
		({
			saving: "Saving…",
			dirty: "Unsaved changes",
			saved: "All changes saved",
		})[saveState.value],
);

// Save-info popover + manual-save throttle (mirrors store cooldown so the
// button visibly disables between presses; store enforces the hard floor).
const saveInfoOpen = ref(false);
const saveInfoEvent = ref<Event | undefined>();
const cooling = ref(false);

const openSaveInfo = (e: Event) => {
	saveInfoEvent.value = e;
	saveInfoOpen.value = true;
};

const onSaveNow = async () => {
	if (!isDirty.value || isSaving.value || cooling.value) return;
	cooling.value = true;
	setTimeout(() => (cooling.value = false), 3000);
	await saveNow();
};

// Overflow popover state
const moreOpen = ref(false);
const moreEvent = ref<Event | undefined>();

const openMore = (e: Event) => {
	moreEvent.value = e;
	moreOpen.value = true;
};

const runFromMore = (action: () => void) => {
	moreOpen.value = false;
	action();
};

const onFullscreen = () => {
	requestAnimationFrame(() => {
		toast("Fullscreen: Messages Silenced");
		emit("toggle-fullscreen");
	});
};

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

<style scoped>
/* Overriding base styles to ensure custom-class hover variables take strict priority over fallback logic */
#send:hover {
  background-color: var(--ion-color-secondary-tint, #3dd5c8) !important;
}

ion-list {
  padding: 0;
}

/* Save button fades/scales in on the first stroke instead of snapping in. */
.save-pop-enter-active,
.save-pop-leave-active {
  transition: all 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}

.save-pop-enter-from,
.save-pop-leave-to {
  opacity: 0;
  transform: scale(0.6);
  width: 0;
  margin: 0;
}

ion-popover {
  --width: auto;
}
</style>
