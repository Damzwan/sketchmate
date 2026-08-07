<template>
  <div
    class="w-full overflow-visible msg-row"
    :class="{
      'mt-[-5px]': isCompact && !isSystemMessage,
      'msg-row--media': isMediaMessage,
    }"
  >
    <ChatSystemMessage
      v-if="isSystemMessage"
      :msg="msg"
      :partner="partner"
      @inspect-profile="emitInspectProfile"
    />
    <ChatUserMessage
      v-else
      :msg="msg"
      :partner="partner"
      :is-me="isMe"
      :is-compact="isCompact"
      :active-tab="activeTab"
      @inspect-profile="emitInspectProfile"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ChatSystemMessage from "./ChatSystemMessage.vue";
import ChatUserMessage from "./ChatUserMessage.vue";

const props = defineProps<{
	msg: any;
	partner: any;
	isMe: boolean;
	isCompact: boolean;
	activeTab: string;
}>();

const emit =
	defineEmits<
		(event: "inspect-profile", pointerEvent: Event, user: any) => void
	>();

const emitInspectProfile = (pointerEvent: Event, user: any) => {
	emit("inspect-profile", pointerEvent, user);
};

const isSystemMessage = computed(
	() =>
		props.msg.type && props.msg.type !== "message" && props.msg.type !== "user",
);
const isMediaMessage = computed(
	() => !!(props.msg.shared_post_id || props.msg.shared_inbox_item_id),
);
</script>

<style scoped>
/* Chromium/WebView can skip layout and paint for off-screen rows without a JS
   virtual-scroller taking ownership of scroll anchoring. `auto` remembers each
   row's measured height after its first render. */
.msg-row {
  content-visibility: auto;
  contain-intrinsic-size: auto 64px;
}

.msg-row--media {
  contain-intrinsic-size: auto 232px;
}
</style>
