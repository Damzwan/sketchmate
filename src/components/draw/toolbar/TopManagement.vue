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

    <!-- Combined chat button — chat icon + unread badge AND online-friends count.
         Presence is TopBar's green pill rather than a second bare icon (two
         monochrome glyphs side by side read as two separate buttons), but
         without the word "online": this toolbar shares its row with five other
         controls, and the label alone cost more width than the whole pill does.
         The dot carries the meaning; it collapses to nothing at zero, so the
         common case is narrower than the two-icon version it replaces. -->
    <button :disabled="!isLoggedIn" @click="openPanel"
      class="relative flex items-center gap-1 pl-2 pr-2 h-10 rounded-xl transition-all active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
      :class="!isLoggedIn ? '' : 'hover:bg-primary/20 cursor-pointer'">
      <div class="relative flex items-center justify-center">
        <ion-icon :icon="chatbubblesOutline" class="w-6 h-6 text-black" />
        <span v-if="totalUnreadCount > 0"
          class="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-secondary text-white text-[10px] font-black flex items-center justify-center leading-none border border-primary/40">
          {{ totalUnreadCount > 99 ? '99+' : totalUnreadCount }}
        </span>
      </div>

      <span v-if="onlineFriends.length > 0" class="online-pill">
        <span class="online-dot"></span>
        {{ onlineFriends.length > 99 ? '99+' : onlineFriends.length }}
      </span>
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

          <ion-item color="tertiary" :button="true" :detail="false" v-if="IS_TESTING_DRAW"
            @click="runFromMore(() => emit('start-benchmark'))">
            <ion-icon :icon="playCircleOutline" />
            <div class="pl-2 min-w-0 flex-1">
              <p class="text-base">Start performance capture</p>
              <p class="text-sm text-black/60 leading-tight">
                Record drawing, zoom, erase, and history
              </p>
            </div>
          </ion-item>

          <ion-item color="tertiary" :detail="false" v-if="IS_TESTING_DRAW">
            <ion-icon :icon="hardwareChipOutline" />
            <div class="pl-2 min-w-0 flex-1">
              <p class="text-base">Worker rendering</p>
              <p class="text-sm text-black/60 leading-tight">
                {{ renderBackendSubtitle }}
              </p>
            </div>
            <ion-toggle
              slot="end"
              mode="ios"
              color="secondary"
              aria-label="Use experimental web-worker rendering"
              :checked="selectedRenderBackend === 'worker'"
              @ionChange="onRenderBackendChange"
            />
          </ion-item>

          <ion-item color="tertiary" :detail="false" v-if="IS_TESTING_DRAW"
            :disabled="selectedRenderBackend !== 'worker'">
            <ion-icon :icon="gitBranchOutline" />
            <div class="pl-2 min-w-0 flex-1">
              <p class="text-base">Worker protocol v2</p>
              <p class="text-sm text-black/60 leading-tight">
                {{ workerProtocolSubtitle }}
              </p>
            </div>
            <ion-toggle
              slot="end"
              mode="ios"
              color="secondary"
              aria-label="Use worker protocol version 2"
              :checked="selectedWorkerProtocol === 'v2'"
              @ionChange="onWorkerProtocolChange"
            />
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-popover>

    <!-- Save status + manual save -->
    <SavePopover ref="savePopover" />

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { storeToRefs } from "pinia";
import { useDrawSyncer } from "@/draw/sync/session.store";
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
import { Menu } from "@/types/menu.types";
import SendHub from "../send/SendHub.vue";
import { useAuthStore } from "@/store/auth.store";
import { useFriendStore } from "@/store/friend.store";
import {
	bulbOutline,
	chatbubblesOutline,
	gitBranchOutline,
	hardwareChipOutline,
	megaphoneOutline,
	playCircleOutline,
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
	IonToggle,
	modalController,
	type ToggleCustomEvent,
} from "@ionic/vue";
import { useDocumentStore } from "@/draw/document/document.store";
import ReportUserMenu from "@/components/moderation/ReportUserMenu.vue";
import SavePopover from "./SavePopover.vue";
import {
	DRAW_RENDER_BACKEND_QUERY_KEY,
	type DrawRenderBackend,
	getDrawRenderBackend,
	setDrawRenderBackend,
} from "@/draw/config/renderBackend.config";
import {
	getWorkerProtocolMode,
	setWorkerProtocolMode,
	type WorkerProtocolMode,
	WORKER_PROTOCOL_QUERY_KEY,
} from "@/draw/config/workerProtocol.config";

const emit = defineEmits(["toggle-fullscreen", "start-benchmark"]);

const { roomMembers, isLobby } = storeToRefs(useDrawSyncer());
const { onlineFriends } = storeToRefs(useFriendStore());
const { openMenu } = useMenuStore();
const { isLoggedIn, user } = storeToRefs(useAuthStore());
const { openPanel } = useChatWidgetStore();
const { isSaving, isDirty, sessionHasContent } = storeToRefs(
	useDocumentStore(),
);
const IS_TESTING_DRAW = import.meta.env.VITE_DRAW_TESTING === "si";

const { totalUnreadCount } = storeToRefs(useChatStore());
const { toast } = useToast();

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
// Save-status popover (its own component owns the status + manual-save throttle).
const savePopover = ref<InstanceType<typeof SavePopover> | null>(null);
const openSaveInfo = (e: Event) => savePopover.value?.open(e);

// Overflow popover state
const moreOpen = ref(false);
const moreEvent = ref<Event | undefined>();
const activeRenderBackend = getDrawRenderBackend();
const selectedRenderBackend = ref<DrawRenderBackend>(activeRenderBackend);
const activeWorkerProtocol = getWorkerProtocolMode();
const selectedWorkerProtocol = ref<WorkerProtocolMode>(activeWorkerProtocol);
const renderBackendPending = computed(
	() => selectedRenderBackend.value !== activeRenderBackend,
);
const workerProtocolPending = computed(
	() => selectedWorkerProtocol.value !== activeWorkerProtocol,
);
const renderBackendSubtitle = computed(() => {
	if (renderBackendPending.value) return "Reopen drawing to apply";
	return selectedRenderBackend.value === "worker" ? "Enabled" : "Main thread";
});
const workerProtocolSubtitle = computed(() => {
	if (workerProtocolPending.value) return "Reopen drawing to apply";
	return selectedWorkerProtocol.value === "v2"
		? "Revisioned batches"
		: "Legacy protocol";
});

const openMore = (e: Event) => {
	moreEvent.value = e;
	moreOpen.value = true;
};

const onRenderBackendChange = (e: ToggleCustomEvent) => {
	const backend: DrawRenderBackend = e.detail.checked ? "worker" : "main";
	if (!setDrawRenderBackend(backend)) {
		toast("Could not save renderer setting");
		return;
	}
	selectedRenderBackend.value = backend;

	// If this canvas was opened through an A/B URL, keep that explicit override
	// in sync too; query parameters intentionally win over local persistence.
	const url = new URL(window.location.href);
	if (url.searchParams.has(DRAW_RENDER_BACKEND_QUERY_KEY)) {
		url.searchParams.set(DRAW_RENDER_BACKEND_QUERY_KEY, backend);
		window.history.replaceState(window.history.state, "", url);
	}

	if (renderBackendPending.value) {
		toast("Renderer saved — reopen the drawing to apply");
	} else {
		toast("Renderer change cancelled");
	}
};

const onWorkerProtocolChange = (e: ToggleCustomEvent) => {
	const mode: WorkerProtocolMode = e.detail.checked ? "v2" : "legacy";
	if (!setWorkerProtocolMode(mode)) {
		toast("Could not save worker protocol setting");
		return;
	}
	selectedWorkerProtocol.value = mode;

	const url = new URL(window.location.href);
	if (url.searchParams.has(WORKER_PROTOCOL_QUERY_KEY)) {
		url.searchParams.set(WORKER_PROTOCOL_QUERY_KEY, mode);
		window.history.replaceState(window.history.state, "", url);
	}

	if (workerProtocolPending.value) {
		toast("Worker protocol saved — reopen the drawing to apply");
	} else {
		toast("Worker protocol change cancelled");
	}
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

/* Presence pill — TopBar's language, count only. Green = live. */
.online-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 9999px;
  background: rgba(16, 185, 129, 0.14);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #047857;
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
}

.online-dot {
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: #10b981;
  animation: online-pulse 2.4s ease-in-out infinite;
}

@keyframes online-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.8); }
}
</style>
