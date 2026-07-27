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

    <div class="flex flex-col max-w-[75%] overflow-visible" :class="{ 'items-end': isMe }">
      <ChatMediaMessage
        v-if="isMediaMessage"
        :msg="msg"
        :is-me="isMe"
        :active-tab="activeTab"
      />

      <div
        v-else
        class="py-2 px-3 text-[15px] shadow-sm cabin-sketch-regular tracking-wide relative max-w-full overflow-visible"
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
          {{ msg.content || msg.message }}
        </div>

        <div class="text-xs mt-1 cabin-sketch-regular opacity-80 flex justify-end items-center gap-0.5 select-none leading-none">
          <span>{{ dayjs(msg.createdAt).format("HH:mm") }}</span>
          <span v-if="isMe && activeTab !== 'lobby'" class="text-[9px] flex items-center leading-none">
            <svg viewBox="0 0 24 24" class="w-3 h-3 fill-current" :class="statusTick.classOnBubble" aria-hidden="true">
              <path :d="statusTick.path" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import dayjs from "dayjs";
import { mdiAlertCircleOutline, mdiCheckAll, mdiClockOutline } from "@mdi/js";
import UserAvatar from "@/components/profile/customization/UserAvatar.vue";
import { useSenderStyle } from "@/composables/chat/useSenderStyle";
import ChatMediaMessage from "./ChatMediaMessage.vue";

const props = defineProps<{
	msg: any;
	partner: any;
	isMe: boolean;
	isCompact: boolean;
	activeTab: string;
}>();

defineEmits<{
	(event: "inspect-profile", pointerEvent: Event, user: any): void;
}>();

const sender = computed(() => props.msg.member || props.partner);
const senderStyle = useSenderStyle(sender);
const senderCustomization = computed(() => senderStyle.value.customization);
const theme = computed(() => senderStyle.value.theme);
const resolvedFontFamily = computed(() => senderStyle.value.fontFamily);
const displayTitle = computed(() => senderStyle.value.title);
const isMediaMessage = computed(
	() => !!(props.msg.shared_post_id || props.msg.shared_inbox_item_id),
);

const statusTick = computed(() => {
	if (props.msg.status === "sending")
		return { path: mdiClockOutline, classOnBubble: "opacity-50" };
	if (props.msg.status === "error")
		return { path: mdiAlertCircleOutline, classOnBubble: "text-red-300" };
	return { path: mdiCheckAll, classOnBubble: "text-white/80" };
});
</script>
