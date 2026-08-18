<template>
  <div class="flex justify-center w-full my-1.5 select-none">
    <div
      v-if="msg.system_kind === 'balloon_match'"
      class="flex items-center gap-2 px-3 py-1 bg-white border border-primary/50 shadow-sm rounded-full"
    >
      <ion-icon :icon="svg(mdiBalloon)" class="text-sm leading-none mt-[-2px] text-secondary" />
      <span class="text-xs font-black cabin-sketch-regular text-black/80 uppercase tracking-wide">
        <template v-if="isAcceptor">
          You caught <span class="text-black font-black">{{ otherPartyName }}</span>'s balloon
        </template>
        <template v-else>
          <span class="text-black font-black">{{ otherPartyName }}</span> caught your balloon
        </template>
      </span>
    </div>

    <!-- A shared reference announces itself here instead of opening on the
         canvas. Two explicit choices, no default action on the row itself. -->
    <div
      v-else-if="msg.type === 'reference'"
      class="flex items-center gap-2 px-3 py-1.5 bg-white border border-primary/50 shadow-sm rounded-2xl max-w-[85%]"
    >
      <ion-icon :icon="svg(mdiImageMultipleOutline)" class="text-sm shrink-0 text-secondary" />
      <span class="text-xs cabin-sketch-regular text-black/80 uppercase tracking-tight min-w-0">
        <span class="text-black font-black">{{ sender?.name }}</span>
        <span class="ml-1">shared a reference</span>
      </span>
      <span
        v-if="!referenceExists"
        class="shrink-0 text-[10px] font-black uppercase tracking-wide text-black/40"
      >
        Removed
      </span>
      <button
        v-else
        type="button"
        class="shrink-0 px-2 py-0.5 rounded-full bg-secondary text-white text-[10px] font-black uppercase tracking-wide cursor-pointer active:scale-95 transition-transform"
        @click="openReference"
      >
        View
      </button>
      <button
        type="button"
        class="shrink-0 w-6 h-6 grid place-items-center rounded-full text-black/50 cursor-pointer active:scale-95 transition-transform"
        aria-label="Report reference"
        @click="reportReference"
      >
        <ion-icon :icon="svg(mdiFlagOutline)" class="text-sm" />
      </button>
    </div>

    <div
      v-else
      class="flex items-center gap-1.5 px-2 py-0.5 cursor-pointer active:opacity-60 transition-opacity"
      @click="$emit('inspect-profile', $event, sender)"
    >
      <div class="origin-left scale-[0.7] w-8 h-8 flex items-center justify-center -mr-1.5">
        <UserAvatar
          v-if="sender"
          :user="sender"
          :customization="senderCustomization"
          size="xs"
          static
          class="shrink-0"
        />
      </div>
      <span class="text-xs cabin-sketch-regular text-black/80 uppercase tracking-tight">
        <span class="text-black/80 font-black">{{ sender?.name }}</span>
        <span class="ml-1">{{ msg.type === "join" ? "entered" : "left" }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import { mdiBalloon, mdiFlagOutline, mdiImageMultipleOutline } from "@mdi/js";
import { storeToRefs } from "pinia";
import { computed } from "vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useSenderStyle } from "@/composables/chat/useSenderStyle";
import { useDrawingReferenceStore } from "@/draw/references/reference.store";
import { useDrawSyncer } from "@/draw/sync/session.store";
import { svg } from "@/helper/general.helper";
import { useAuthStore } from "@/store/auth.store";
import { useChatWidgetStore } from "@/store/chatWidget.store";
import { useMenuStore } from "@/store/menu.store";
import { useModerationStore } from "@/store/moderation.store";
import { Menu } from "@/types/menu.types";

const props = defineProps<{ msg: any; partner: any }>();

defineEmits<
	(event: "inspect-profile", pointerEvent: Event, user: any) => void
>();

const { user: me } = storeToRefs(useAuthStore());
const sender = computed(() => props.msg.member || props.partner);
const senderStyle = useSenderStyle(sender);
const senderCustomization = computed(() => senderStyle.value.customization);
const isAcceptor = computed(
	() => props.msg.system_payload?.acceptor_id === me.value?._id,
);
const references = useDrawingReferenceStore();
// The row outlives the reference — the owner can pull it, you can remove it for
// yourself, a report purges it for the room.
const currentReference = computed(() =>
	references.references.find((item) => item.id === props.msg.referenceId),
);
const referenceExists = computed(() => !!currentReference.value);

/**
 * Hand off to the references sheet — close the chat, open the sheet, and do
 * NOT put the image on the canvas. Showing it is the sheet's eye toggle, i.e.
 * still the viewer's call; this button only takes them to where the choice is.
 */
function openReference() {
	if (!referenceExists.value) return;
	useChatWidgetStore().closePanel();
	useMenuStore().openMenu(Menu.Reference);
}

function reportReference() {
	useModerationStore().openReport({
		type: "lobby_reference",
		id: props.msg.referenceId,
		blockUserId: String(sender.value?._id ?? ""),
		// The image only exists in the room, so the report has to say which room
		// to lift it out of.
		contextRoomId: useDrawSyncer().roomId,
	});
}

const otherPartyName = computed(() => {
	const payload = props.msg.system_payload;
	if (!payload) return "someone";
	return isAcceptor.value
		? props.partner?.name || "someone"
		: payload.acceptor_name || props.partner?.name || "someone";
});
</script>
