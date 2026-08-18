<template>
  <div class="flex items-start gap-2.5 px-0.5 py-0.5 w-full" :class="{ 'flex-row-reverse': isMe }">
    <div
      v-if="!isMe && !isCompact"
      class="w-8 h-8 shrink-0 flex items-center justify-center cursor-pointer"
      @click="$emit('inspect-profile', $event, sender)"
    >
      <UserAvatar
        v-if="sender"
        :user="sender"
        :customization="senderCustomization"
        size="xs"
        static
        class="shrink-0"
      />
    </div>
    <div v-else-if="!isMe" class="w-8 shrink-0"></div>

    <!-- `data-msg-id` is what the thread-level long-press handler resolves back
         to a message (see composables/chat/useMessageActions). An attribute, not
         a listener, so adding message actions costs this list nothing per row. -->
    <div
      class="flex flex-col overflow-visible"
      :class="isMe ? 'items-end max-w-[75%]' : 'max-w-[calc(75%+2.75rem)]'"
      :data-msg-id="msg._id || msg.id"
    >
      <!-- Bubble + its actions trigger on one line. `data-msg-menu` is the
           explicit tap target for the same sheet long-press opens; both are
           resolved by the thread-level delegated handlers, so this row still
           adds no listeners of its own. -->
      <div class="message-line flex items-center max-w-full min-w-0" :class="{ 'flex-row-reverse': isMe }">
        <ChatMediaMessage
          v-if="isMediaMessage"
          :msg="msg"
          :is-me="isMe"
          :active-tab="activeTab"
        />

        <div
          v-else
          class="py-2 px-3 text-[15px] shadow-sm cabin-sketch-regular tracking-wide relative max-w-full min-w-0 overflow-visible"
          :class="isMe
            ? 'bg-secondary text-white rounded-2xl rounded-tr-sm'
            : 'bg-white text-black rounded-2xl rounded-tl-sm border border-primary/40'"
        >
          <div
            v-if="!isCompact && !isMe && activeTab === 'lobby'"
            class="mb-1 flex items-baseline gap-1 leading-none min-w-0 max-w-full"
          >
            <span
              class="text-xs font-black uppercase tracking-tight truncate min-w-0"
              :style="{ color: theme.nameColorOnLight, fontFamily: resolvedFontFamily }"
            >
              {{ sender?.name }}
            </span>
            <span
              v-if="displayTitle"
              class="text-[10px] uppercase tracking-widest opacity-80 truncate min-w-0"
              :style="{ color: theme.descColorOnLight, fontFamily: resolvedFontFamily }"
            >
              • {{ displayTitle }}
            </span>
          </div>

          <div class="cabin-sketch-regular leading-snug break-words pr-2">
            {{ displayText }}
          </div>

          <div class="text-xs mt-1 opacity-80 flex justify-end items-center gap-0.5 select-none leading-none">
            <span>{{ dayjs(msg.createdAt).format("HH:mm") }}</span>
            <span v-if="isMe && activeTab !== 'lobby'" class="text-[9px] flex items-center leading-none">
              <svg viewBox="0 0 24 24" class="w-3 h-3 fill-current" :class="statusTick.classOnBubble" aria-hidden="true">
                <path :d="statusTick.path" />
              </svg>
            </span>
          </div>
        </div>

        <!-- Reporting is relevant to received messages, so keep one explicit,
             accessible route there. Own messages retain long-press for Copy
             without paying for a permanent control on every row. -->
        <button
          v-if="!isMe"
          type="button"
          data-msg-menu
          class="msg_menu_btn text-black/70"
          aria-label="Actions for this message"
        >
          <ion-icon :icon="svg(mdiDotsHorizontal)" class="pointer-events-none text-base" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from "@ionic/vue";
import {
	mdiAlertCircleOutline,
	mdiCheckAll,
	mdiClockOutline,
	mdiDotsHorizontal,
} from "@mdi/js";
import dayjs from "dayjs";
import { computed } from "vue";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useSenderStyle } from "@/composables/chat/useSenderStyle";
import { svg } from "@/helper/general.helper";
import { safeText } from "@/helper/profanity.helper";
import ChatMediaMessage from "./ChatMediaMessage.vue";

const props = defineProps<{
	msg: any;
	partner: any;
	isMe: boolean;
	isCompact: boolean;
	activeTab: string;
}>();

defineEmits<
	(event: "inspect-profile", pointerEvent: Event, user: any) => void
>();

const sender = computed(() => props.msg.member || props.partner);
const senderStyle = useSenderStyle(sender);
const senderCustomization = computed(() => senderStyle.value.customization);
const theme = computed(() => senderStyle.value.theme);
const resolvedFontFamily = computed(() => senderStyle.value.fontFamily);
const displayTitle = computed(() => senderStyle.value.title);
const isMediaMessage = computed(
	() => !!(props.msg.shared_post_id || props.msg.shared_inbox_item_id),
);

// DMs carry `content`/`content_filtered`; lobby messages carry
// `message`/`message_filtered`. Both twins were produced server-side at write
// time, so this is a field pick — the filter toggle costs nothing per bubble.
const displayText = computed(() =>
	safeText(
		props.msg.content || props.msg.message,
		props.msg.content_filtered ?? props.msg.message_filtered,
	),
);

const statusTick = computed(() => {
	if (props.msg.status === "sending")
		return { path: mdiClockOutline, classOnBubble: "opacity-50" };
	if (props.msg.status === "error")
		return { path: mdiAlertCircleOutline, classOnBubble: "text-red-300" };
	return { path: mdiCheckAll, classOnBubble: "text-white/80" };
});
</script>

<style scoped>
@reference "@/theme/main.css";

.msg_menu_btn {
  @apply w-11 h-11 shrink-0 rounded-full flex items-center justify-center
  cursor-pointer transition-[color,background-color,transform,opacity]
  hover:bg-black/5 focus-visible:bg-black/5 focus-visible:outline-2
  focus-visible:outline-offset-[-2px] focus-visible:outline-secondary
  active:scale-90;
  opacity: 0.55;
}

@media (hover: hover) and (pointer: fine) {
  .msg_menu_btn {
    opacity: 0.28;
  }

  .message-line:hover .msg_menu_btn,
  .msg_menu_btn:focus-visible {
    opacity: 1;
  }
}
</style>
